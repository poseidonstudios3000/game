import numpy as np, soundfile as sf, librosa, json, warnings
warnings.filterwarnings("ignore")

F="/root/.claude/uploads/8480b0c1-915b-5e10-915e-4bbb278c3332/df15102f-Samm_BE_JUNO_DE__Heart_Spin_Original_Mix_Melodic_Progressive_House_20260529.mp3"
OUT="/home/user/game/scratchpad_analysis"

# ---- load ----
y, sr = sf.read(F, always_2d=True)   # (N,2) float64 -1..1
y = y.T.astype(np.float32)           # (2,N)
L, R = y[0], y[1]
mono = 0.5*(L+R)
N = mono.shape[0]
dur = N/sr
res = {}
res["file"]={"sr":sr,"duration_s":round(dur,2),"channels":2,"samples":int(N)}

# ---- levels / dynamics ----
def dbfs(x): 
    r=np.sqrt(np.mean(x**2)); 
    return 20*np.log10(r+1e-12)
peakL=np.max(np.abs(L)); peakR=np.max(np.abs(R))
res["levels"]={
  "peak_dbfs":round(20*np.log10(max(peakL,peakR)+1e-12),2),
  "rms_dbfs_mono":round(dbfs(mono),2),
  "crest_factor_db":round(20*np.log10((max(peakL,peakR)+1e-12)/(np.sqrt(np.mean(mono**2))+1e-12)),2),
  "clip_ratio_pct":round(100*np.mean(np.abs(mono)>0.999),4),
}

# ---- tempo ----
mono22=librosa.resample(mono, orig_sr=sr, target_sr=22050)
sr2=22050
tempo, beats = librosa.beat.beat_track(y=mono22, sr=sr2, trim=False)
tempo=float(np.atleast_1d(tempo)[0])
# refine with tempogram / autocorrelation of onset env
oenv=librosa.onset.onset_strength(y=mono22, sr=sr2)
res["tempo"]={"bpm_est":round(tempo,2),"bpm_rounded":round(tempo)}

# ---- key (Krumhansl-Schmuckler) ----
chroma=librosa.feature.chroma_cqt(y=mono22, sr=sr2)
chroma_mean=chroma.mean(axis=1)
maj=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
minp=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def corr(a,b): 
    a=a-a.mean(); b=b-b.mean(); 
    return np.sum(a*b)/(np.sqrt(np.sum(a**2)*np.sum(b**2))+1e-12)
scores=[]
for i in range(12):
    scores.append((corr(chroma_mean,np.roll(maj,i)),names[i],"major"))
    scores.append((corr(chroma_mean,np.roll(minp,i)),names[i],"minor"))
scores.sort(reverse=True)
res["key"]={"best":f"{scores[0][1]} {scores[0][2]}","top3":[[round(s[0],3),s[1],s[2]] for s in scores[:3]],
            "chroma_profile":{names[i]:round(float(chroma_mean[i]),3) for i in range(12)}}

# ---- band energy over time (arrangement map) ----
hop=int(sr*0.25)  # 0.25s frames
win=int(sr*0.5)
def band_rms(x, lo, hi):
    from scipy.signal import butter, sosfilt
    ny=sr/2
    lo=max(lo,1)/ny; hi=min(hi,ny-1)/ny
    sos=butter(4,[lo,hi],btype='band',output='sos')
    xf=sosfilt(sos,x)
    n=(len(xf)-win)//hop
    out=np.array([np.sqrt(np.mean(xf[i*hop:i*hop+win]**2)) for i in range(n)])
    return 20*np.log10(out+1e-9)
bands={"sub_20_60":(20,60),"kick_bass_60_120":(60,120),"lowmid_120_400":(120,400),
       "mid_400_2k":(400,2000),"highmid_2k_6k":(2000,6000),"air_6k_16k":(6000,16000)}
env={}
for k,(lo,hi) in bands.items():
    env[k]=band_rms(mono,lo,hi)
minlen=min(len(v) for v in env.values())
for k in env: env[k]=env[k][:minlen]
t=np.arange(minlen)*hop/sr
# overall rms env
rms_full=librosa.feature.rms(y=mono, frame_length=win, hop_length=hop)[0][:minlen]
rms_db=20*np.log10(rms_full+1e-9)

# ---- spectral descriptors over time ----
S=np.abs(librosa.stft(mono22, n_fft=2048, hop_length=1024))
cent=librosa.feature.spectral_centroid(S=S, sr=sr2)[0]
roll=librosa.feature.spectral_rolloff(S=S, sr=sr2, roll_percent=0.85)[0]
tt=librosa.frames_to_time(np.arange(len(cent)), sr=sr2, hop_length=1024)
res["spectral"]={"centroid_hz_mean":round(float(cent.mean()),1),
                 "rolloff85_hz_mean":round(float(roll.mean()),1)}

# ---- average full-mix spectrum (band distribution) ----
fullS=np.abs(librosa.stft(mono22, n_fft=8192, hop_length=4096))
freqs=librosa.fft_frequencies(sr=sr2, n_fft=8192)
avg_spec=fullS.mean(axis=1)
def bandavg(lo,hi):
    m=(freqs>=lo)&(freqs<hi)
    return 20*np.log10(avg_spec[m].mean()+1e-9)
tonal_bal={k:round(bandavg(lo,hi),1) for k,(lo,hi) in bands.items()}
res["tonal_balance_db"]=tonal_bal

# ---- stereo width by band (mid/side) ----
mid=0.5*(L+R); side=0.5*(L-R)
def ms_ratio(lo,hi):
    from scipy.signal import butter, sosfilt
    ny=sr/2
    sos=butter(4,[max(lo,1)/ny,min(hi,ny-1)/ny],btype='band',output='sos')
    m=np.sqrt(np.mean(sosfilt(sos,mid)**2)); s=np.sqrt(np.mean(sosfilt(sos,side)**2))
    return round(20*np.log10((s+1e-9)/(m+1e-9)),1)  # side-minus-mid dB (more negative=narrower)
res["stereo_side_minus_mid_db"]={k:ms_ratio(lo,hi) for k,(lo,hi) in bands.items()}
res["overall_correlation"]=round(float(np.corrcoef(L,R)[0,1]),3)

# ---- onset / percussion density over time ----
oenv_full=librosa.onset.onset_strength(y=mono22, sr=sr2, hop_length=512)
ot=librosa.frames_to_time(np.arange(len(oenv_full)), sr=sr2, hop_length=512)

# save arrays for plotting
np.savez(OUT+"/arrays.npz", t=t, rms_db=rms_db,
         **{f"band_{k}":v for k,v in env.items()},
         tt=tt, cent=cent, roll=roll, ot=ot, oenv=oenv_full,
         freqs=freqs, avg_spec=avg_spec,
         beats_t=librosa.frames_to_time(beats, sr=sr2))

# ---- crude section detection from kick/bass presence + rms ----
kick=env["kick_bass_60_120"]; sub=env["sub_20_60"]
lowE=np.maximum(kick,sub)
# normalize
kn=(lowE-lowE.min())/(lowE.max()-lowE.min()+1e-9)
rn=(rms_db-rms_db.min())/(rms_db.max()-rms_db.min()+1e-9)
# smooth
def smooth(x,w=8):
    k=np.ones(w)/w; return np.convolve(x,k,mode='same')
kns=smooth(kn); rns=smooth(rn)
# kick present when low band within 10 dB of its running max-ish
kick_on = kn > 0.55
# segment into runs
segs=[]
cur=kick_on[0]; start=0
for i in range(1,len(kick_on)):
    if kick_on[i]!=cur:
        segs.append((round(start*hop/sr,1), round(i*hop/sr,1), "KICK" if cur else "no-kick",
                     round(float(rms_db[start:i].mean()),1)))
        start=i; cur=kick_on[i]
segs.append((round(start*hop/sr,1), round(len(kick_on)*hop/sr,1), "KICK" if cur else "no-kick",
             round(float(rms_db[start:].mean()),1)))
# merge tiny segs (<4s)
merged=[]
for s in segs:
    if merged and (s[1]-s[0])<4 and s[2]==merged[-1][2]:
        merged[-1]=(merged[-1][0],s[1],merged[-1][2],merged[-1][3])
    else:
        merged.append(list(s))
res["sections_kick_based"]=[{"start":m[0],"end":m[1],"len_s":round(m[1]-m[0],1),"state":m[2],"avg_rms_db":m[3]} for m in merged if (m[1]-m[0])>=4]

json.dump(res, open(OUT+"/analysis.json","w"), indent=2, default=float)
print(json.dumps(res, indent=2, default=float))
