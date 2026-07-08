import numpy as np, soundfile as sf, librosa, json, warnings
from scipy.signal import butter, sosfilt, bilinear
warnings.filterwarnings("ignore")
OUT="/home/user/game/scratchpad_analysis"
F="/root/.claude/uploads/8480b0c1-915b-5e10-915e-4bbb278c3332/df15102f-Samm_BE_JUNO_DE__Heart_Spin_Original_Mix_Melodic_Progressive_House_20260529.mp3"
y,sr=sf.read(F, always_2d=True); L=y[:,0].astype(np.float32); R=y[:,1].astype(np.float32)
mono=0.5*(L+R)
out={}

# ---------- Integrated LUFS (ITU-R BS.1770 K-weighting) ----------
def k_weight(x,sr):
    # stage1 high shelf
    f0=1681.97; G=3.999; Q=0.7071
    K=np.tan(np.pi*f0/sr); Vh=10**(G/20); Vb=Vh**0.4996
    a0=1+K/Q+K*K
    b0=(Vh+Vb*K/Q+K*K)/a0; b1=2*(K*K-Vh)/a0; b2=(Vh-Vb*K/Q+K*K)/a0
    a1=2*(K*K-1)/a0; a2=(1-K/Q+K*K)/a0
    from scipy.signal import lfilter
    x=lfilter([b0,b1,b2],[1,a1,a2],x)
    # stage2 high pass
    f0=38.13; Q=0.5003
    K=np.tan(np.pi*f0/sr)
    a0=1+K/Q+K*K
    b0=1/a0; b1=-2/a0; b2=1/a0
    a1=2*(K*K-1)/a0; a2=(1-K/Q+K*K)/a0
    x=lfilter([b0,b1,b2],[1,a1,a2],x)
    return x
Lk=k_weight(L,sr); Rk=k_weight(R,sr)
# gated loudness, 400ms blocks 75% overlap
bs=int(0.4*sr); step=int(0.1*sr)
def block_loud(xk):
    n=(len(xk)-bs)//step
    return np.array([np.mean(xk[i*step:i*step+bs]**2) for i in range(n)])
ms=block_loud(Lk)+block_loud(Rk)
lj=-0.691+10*np.log10(ms+1e-12)
abs_gate=lj>-70
mean1=np.mean(ms[abs_gate])
gl=-0.691+10*np.log10(mean1)
rel_gate=lj>(gl-10)
integ=-0.691+10*np.log10(np.mean(ms[abs_gate&rel_gate]))
# loudness range approx (10th-95th pct of gated short-term)
gated=lj[abs_gate&rel_gate]
out["loudness"]={"integrated_LUFS":round(float(integ),1),
  "LRA_approx":round(float(np.percentile(gated,95)-np.percentile(gated,10)),1),
  "note":"true-peak >0 dBFS observed (hot master)"}

# ---------- Tempo candidates ----------
m22=librosa.resample(mono,orig_sr=sr,target_sr=22050); sr2=22050
oenv=librosa.onset.onset_strength(y=m22,sr=sr2,hop_length=512)
ac=librosa.autocorrelate(oenv, max_size=int(4*sr2/512))
lags=np.arange(len(ac)); 
sec=lags*512/sr2
bpm=60/np.where(sec>0,sec,1e9)
mask=(bpm>90)&(bpm<160)
idx=np.argsort(ac[mask])[::-1][:5]
cand=sorted([round(float(bpm[mask][i]),1) for i in idx], reverse=True)
tg=librosa.feature.tempo(onset_envelope=oenv,sr=sr2,hop_length=512,aggregate=None)
out["tempo"]={"autocorr_candidates_bpm":cand,
   "dynamic_tempo_median":round(float(np.median(tg)),1),
   "conclusion_bpm":124 if any(abs(c-124)<2 for c in cand) else round(float(np.median(tg)))}

# ---------- Bassline root tracking (drop section) ----------
def bass_notes(seg, sr):
    sos=butter(4,[30/(sr/2),160/(sr/2)],btype='band',output='sos')
    b=sosfilt(sos,seg)
    f0=librosa.yin(b.astype(np.float32),fmin=30,fmax=160,sr=sr,frame_length=4096)
    f0=f0[np.isfinite(f0)&(f0>30)&(f0<160)]
    midi=librosa.hz_to_midi(f0)
    names=librosa.midi_to_note(np.round(midi).astype(int))
    vals,counts=np.unique(names,return_counts=True)
    order=np.argsort(counts)[::-1]
    return [(vals[o],int(counts[o])) for o in order[:6]]
drop=mono[int(255*sr):int(285*sr)]  # ~4:15-4:45 main drop
out["bass_roots_drop"]=bass_notes(drop,sr)
bd=mono[int(195*sr):int(210*sr)]    # ~3:15 breakdown chords low end
out["bass_roots_breakdown"]=bass_notes(bd,sr)

# ---------- refined sections ----------
d=np.load(OUT+"/arrays.npz")
t=d["t"]; rms=d["rms_db"]; kick=d["band_kick_bass_60_120"]; sub=d["band_sub_20_60"]
air=d["band_air_6k_16k"]; mid=d["band_mid_400_2k"]
def sm(x,w=6): return np.convolve(x,np.ones(w)/w,mode='same')
rms_s=sm(rms); low=sm(np.maximum(kick,sub)); air_s=sm(air)
plateau=np.percentile(rms_s,80)
lowmax=np.percentile(low,80)
# classify: full if low present & rms high; break if low absent; build handled by trend
state=[]
for i in range(len(t)):
    if low[i] < lowmax-9 or rms_s[i] < plateau-8:
        state.append("LOW/BREAK")
    else:
        state.append("FULL")
# runs
runs=[]; cur=state[0]; st=0
for i in range(1,len(state)):
    if state[i]!=cur:
        if (i-st)*0.25>=3:
            runs.append([round(st*0.25,1),round(i*0.25,1),cur])
        else:
            state[i-1]=cur  # keep
        st=i; cur=state[i]
runs.append([round(st*0.25,1),round(len(state)*0.25,1),cur])
# merge adjacent same
merged=[]
for r in runs:
    if merged and merged[-1][2]==r[2]:
        merged[-1][1]=r[1]
    else: merged.append(r)
out["sections"]=[{"start":f"{int(r[0]//60)}:{int(r[0]%60):02d}","end":f"{int(r[1]//60)}:{int(r[1]%60):02d}",
                  "len_s":round(r[1]-r[0],1),"type":r[2],
                  "avg_rms_db":round(float(rms[int(r[0]*4):int(r[1]*4)].mean()),1)} for r in merged if r[1]-r[0]>=4]
json.dump(out,open(OUT+"/refine.json","w"),indent=2,default=float)
print(json.dumps(out,indent=2,default=float))
