import numpy as np, soundfile as sf, librosa, warnings
from scipy.signal import butter, sosfilt
warnings.filterwarnings("ignore")
F="/root/.claude/uploads/8480b0c1-915b-5e10-915e-4bbb278c3332/df15102f-Samm_BE_JUNO_DE__Heart_Spin_Original_Mix_Melodic_Progressive_House_20260529.mp3"
y,sr=sf.read(F,always_2d=True); mono=(0.5*(y[:,0]+y[:,1])).astype(np.float32)
# main drop 4:00-5:45 (long, stable, four-on-floor)
seg=mono[int(240*sr):int(345*sr)]
# low-band onset env
lo=sosfilt(butter(4,[35/(sr/2),120/(sr/2)],btype='band',output='sos'),seg)
hop=256
oe=librosa.onset.onset_strength(y=lo,sr=sr,hop_length=hop)
oe=oe-oe.mean()
ac=np.correlate(oe,oe,'full')[len(oe)-1:]
fps=sr/hop
# search beat lag in 100-140 BPM => lag seconds 0.6..0.43 -> beat; but kick=beat so lag ~ 0.43-0.6s
lag_lo=int(fps*60/140); lag_hi=int(fps*60/100)
region=ac[lag_lo:lag_hi]
p=np.argmax(region)+lag_lo
# parabolic interp
a,b,c=ac[p-1],ac[p],ac[p+1]
off=0.5*(a-c)/(a-2*b+c+1e-12)
lag=(p+off)/fps
print(f"beat lag={lag:.5f}s  BPM={60/lag:.3f}")
# also measure over even longer: whole-track low onset autocorr
lo2=sosfilt(butter(4,[35/(sr/2),120/(sr/2)],btype='band',output='sos'),mono)
oe2=librosa.onset.onset_strength(y=lo2,sr=sr,hop_length=hop); oe2=oe2-oe2.mean()
ac2=np.correlate(oe2,oe2,'full')[len(oe2)-1:]
region2=ac2[lag_lo:lag_hi]; p2=np.argmax(region2)+lag_lo
a,b,c=ac2[p2-1],ac2[p2],ac2[p2+1]; off=0.5*(a-c)/(a-2*b+c+1e-12)
lag2=(p2+off)/fps
print(f"whole-track beat lag={lag2:.5f}s  BPM={60/lag2:.3f}")
