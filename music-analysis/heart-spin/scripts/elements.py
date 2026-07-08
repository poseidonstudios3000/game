import numpy as np, soundfile as sf, librosa, json, warnings
from scipy.signal import butter, sosfilt, find_peaks
warnings.filterwarnings("ignore")
OUT="/home/user/game/scratchpad_analysis"
F="/root/.claude/uploads/8480b0c1-915b-5e10-915e-4bbb278c3332/df15102f-Samm_BE_JUNO_DE__Heart_Spin_Original_Mix_Melodic_Progressive_House_20260529.mp3"
y,sr=sf.read(F,always_2d=True); mono=(0.5*(y[:,0]+y[:,1])).astype(np.float32)
out={}

# ----- precise BPM via kick spacing in the main drop -----
seg=mono[int(255*sr):int(285*sr)]   # 4:15-4:45
sos=butter(4,[40/(sr/2),110/(sr/2)],btype='band',output='sos')
lo=sosfilt(sos,seg)
env=np.abs(lo)
# smooth envelope
from scipy.ndimage import uniform_filter1d
env=uniform_filter1d(env, int(0.02*sr))
pk,_=find_peaks(env, distance=int(0.3*sr), height=env.max()*0.35)
ipi=np.diff(pk)/sr
med=np.median(ipi)
out["kick_spacing"]={"n_kicks":len(pk),"median_ipi_s":round(float(med),4),
   "bpm_from_kick":round(60/med,2),"ipi_std":round(float(np.std(ipi)),4)}

# ----- sidechain pump depth: sub-band envelope dip between kicks -----
sub_sos=butter(4,[30/(sr/2),90/(sr/2)],btype='low' if False else 'band',output='sos')
sub=sosfilt(butter(4,90/(sr/2),btype='low',output='sos'),seg)
sube=uniform_filter1d(np.abs(sub),int(0.005*sr))
# align to kicks; measure min between consecutive kicks vs peak just after
depths=[]
for i in range(len(pk)-1):
    a,b=pk[i],pk[i+1]
    window=sube[a:b]
    if len(window)>10:
        peak=np.percentile(window,95); trough=np.percentile(window[len(window)//4:],5)
        if peak>1e-4: depths.append(20*np.log10((trough+1e-9)/(peak+1e-9)))
out["sidechain_pump_db"]=round(float(np.median(depths)),1) if depths else None

# ----- kick profile: analyze single kick -----
k=pk[3]; ksig=seg[k-int(0.005*sr):k+int(0.4*sr)]
sp=np.abs(np.fft.rfft(ksig*np.hanning(len(ksig))))
fr=np.fft.rfftfreq(len(ksig),1/sr)
lowmask=fr<250
fund=fr[lowmask][np.argmax(sp[lowmask])]
# decay time: env down 20dB
kenv=uniform_filter1d(np.abs(ksig),int(0.003*sr))
peakv=kenv.max(); thr=peakv*10**(-20/20)
below=np.where(kenv[np.argmax(kenv):]<thr)[0]
decay=below[0]/sr if len(below) else None
out["kick"]={"fundamental_hz":round(float(fund),1),"decay20db_s":round(float(decay),3) if decay else None}

# ----- offbeat / hat pattern: onset histogram vs beat phase -----
m22=librosa.resample(mono[int(255*sr):int(285*sr)],orig_sr=sr,target_sr=22050)
hi=sosfilt(butter(4,6000/(22050/2),btype='high',output='sos'),m22)
oe=librosa.onset.onset_strength(y=hi.astype(np.float32),sr=22050,hop_length=256)
beat=med  # sec per beat
# phase of each frame within beat
ft=np.arange(len(oe))*256/22050
phase=(ft % beat)/beat
hist,_=np.histogram(phase,bins=8,weights=oe,range=(0,1))
out["hihat_phase_hist_8"]=[round(float(h),1) for h in hist]  # index 0=on-beat, 4=off-beat(&)

# ----- reverb/space in breakdown: RT estimate via envelope decay after a hit -----
json.dump(out,open(OUT+"/elements.json","w"),indent=2,default=float)
print(json.dumps(out,indent=2,default=float))
