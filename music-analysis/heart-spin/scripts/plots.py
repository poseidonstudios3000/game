import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
OUT="/home/user/game/scratchpad_analysis"
d=np.load(OUT+"/arrays.npz")
t=d["t"]; rms=d["rms_db"]
bands=["sub_20_60","kick_bass_60_120","lowmid_120_400","mid_400_2k","highmid_2k_6k","air_6k_16k"]
labels=["Sub 20-60","Kick/Bass 60-120","LowMid 120-400","Mid 400-2k","HiMid 2-6k","Air 6-16k"]
colors=["#7b2ff7","#f72f8e","#f7962f","#2ff7c1","#2f9df7","#c1f72f"]

fig,ax=plt.subplots(3,1,figsize=(16,13),facecolor="white")
# 1 arrangement / band map
for b,l,c in zip(bands,labels,colors):
    ax[0].plot(t/60, d["band_"+b], label=l, color=c, lw=1.1)
ax[0].plot(t/60, rms, color="black", lw=2.0, label="Overall RMS")
ax[0].set_title("Arrangement / per-band energy over time (x=minutes)", fontsize=13)
ax[0].set_ylabel("dB"); ax[0].legend(ncol=4, fontsize=8, loc="lower center")
ax[0].grid(alpha=0.2)
for m in np.arange(0, t[-1]/60, 0.5): ax[0].axvline(m, color="grey", alpha=0.12)

# 2 low band (kick presence) vs air (hats) vs onset density
ot=d["ot"]; oenv=d["oenv"]
ax[1].plot(t/60, d["band_kick_bass_60_120"], color="#f72f8e", lw=1.4, label="Kick/Bass 60-120")
ax[1].plot(t/60, d["band_sub_20_60"], color="#7b2ff7", lw=1.2, label="Sub 20-60")
ax[1].plot(t/60, d["band_air_6k_16k"], color="#2f9df7", lw=1.2, label="Air 6-16k (hats)")
ax[1].set_title("Kick/Sub vs Air (breakdown = low drops, hats change)", fontsize=13)
ax[1].set_ylabel("dB"); ax[1].legend(fontsize=8); ax[1].grid(alpha=0.2)
for m in np.arange(0, t[-1]/60, 0.5): ax[1].axvline(m, color="grey", alpha=0.12)

# 3 onset density (percussive activity) smoothed
w=200
oes=np.convolve(oenv, np.ones(w)/w, mode="same")
ax[2].plot(ot/60, oes, color="#f7962f", lw=1.2)
ax[2].set_title("Onset strength (smoothed) - percussion/transient density; snare rolls=spikes", fontsize=13)
ax[2].set_xlabel("minutes"); ax[2].set_ylabel("onset str"); ax[2].grid(alpha=0.2)
for m in np.arange(0, ot[-1]/60, 0.5): ax[2].axvline(m, color="grey", alpha=0.12)
plt.tight_layout(); plt.savefig(OUT+"/01_arrangement.png", dpi=100); plt.close()

# spectrum + spectrogram
fig,ax=plt.subplots(2,1,figsize=(16,10),facecolor="white")
freqs=d["freqs"]; avg=d["avg_spec"]
avg_db=20*np.log10(avg+1e-9)
ax[0].semilogx(freqs, avg_db, color="#7b2ff7", lw=1.3)
ax[0].set_xlim(20,20000); ax[0].set_title("Average full-mix spectrum (tonal balance)", fontsize=13)
ax[0].set_xlabel("Hz (log)"); ax[0].set_ylabel("dB"); ax[0].grid(alpha=0.3, which="both")
for fq in [60,120,250,500,1000,2000,5000,10000]:
    ax[0].axvline(fq, color="grey", alpha=0.2)
    ax[0].text(fq, avg_db.max(), f"{fq}", fontsize=7, rotation=90, va="top")
# spectrogram from mono (recompute small)
import soundfile as sf, librosa
F="/root/.claude/uploads/8480b0c1-915b-5e10-915e-4bbb278c3332/df15102f-Samm_BE_JUNO_DE__Heart_Spin_Original_Mix_Melodic_Progressive_House_20260529.mp3"
y,sr=sf.read(F, always_2d=True); mono=0.5*(y[:,0]+y[:,1])
m22=librosa.resample(mono.astype(np.float32), orig_sr=sr, target_sr=22050)
S=librosa.amplitude_to_db(np.abs(librosa.stft(m22,n_fft=2048,hop_length=2048)),ref=np.max)
img=ax[1].imshow(S, origin="lower", aspect="auto", cmap="magma",
   extent=[0,len(m22)/22050/60,0,22050/2/1000], vmin=-80, vmax=0)
ax[1].set_ylim(0,12); ax[1].set_title("Spectrogram (0-12kHz)", fontsize=13)
ax[1].set_xlabel("minutes"); ax[1].set_ylabel("kHz")
plt.colorbar(img,ax=ax[1],label="dB")
plt.tight_layout(); plt.savefig(OUT+"/02_spectrum.png", dpi=100); plt.close()
print("plots done")
