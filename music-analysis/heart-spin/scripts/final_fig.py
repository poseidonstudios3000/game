import numpy as np, matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
OUT="/home/user/game/scratchpad_analysis"
d=np.load(OUT+"/arrays.npz")
t=d["t"]/60; rms=d["rms_db"]
low=np.maximum(d["band_kick_bass_60_120"],d["band_sub_20_60"])
air=d["band_air_6k_16k"]
ot=d["ot"]/60; oenv=np.convolve(d["oenv"],np.ones(200)/200,mode="same")

# sections (from refine) in minutes with labels
secs=[(0.0,1.07,"INTRO groove",  "#2f6df7"),
      (1.07,1.58,"BREAKDOWN 1",  "#f7b32f"),
      (1.58,2.13,"DROP 1 / groove","#f72f8e"),
      (2.13,2.65,"BREAK 2 / filter","#f7b32f"),
      (2.65,3.22,"GROOVE 2",     "#f72f8e"),
      (3.22,3.55,"MAIN BREAKDOWN","#9b2ff7"),
      (3.55,4.0,"BUILD-UP",      "#f7962f"),
      (4.0,5.85,"MAIN DROP / peak","#e01e63"),
      (5.85,5.94,"OUTRO",        "#666666")]

fig,ax=plt.subplots(figsize=(15,6.2),facecolor="white")
ax.plot(t,rms,color="#111",lw=2.2,label="Overall RMS",zorder=5)
ax.plot(t,low,color="#f72f8e",lw=1.0,alpha=0.8,label="Kick+Sub (low)")
ax.plot(t,air,color="#2f9df7",lw=1.0,alpha=0.8,label="Air 6-16k (hats/atmos)")
ax2=ax.twinx()
ax2.fill_between(ot,oenv,color="#f7962f",alpha=0.13,zorder=0)
ax2.plot(ot,oenv,color="#f7962f",lw=1.0,alpha=0.5,label="Transient density")
ax2.set_ylim(0,3.6); ax2.set_yticks([]); ax2.set_ylabel("")
ymin,ymax=-70,-2
for s,e,lab,c in secs:
    ax.axvspan(s,e,color=c,alpha=0.10,zorder=0)
    ax.axvline(s,color=c,alpha=0.5,lw=1,ls="--")
    ax.text((s+e)/2,ymax-2,lab,ha="center",va="top",fontsize=7.6,color=c,fontweight="bold",rotation=0)
ax.set_ylim(ymin,ymax); ax.set_xlim(0,5.98)
ax.set_xlabel("time (minutes)"); ax.set_ylabel("level (dB)")
ax.set_title('"Heart Spin" — arrangement / energy map  •  120 BPM  •  B minor  •  -9.2 LUFS',fontsize=12,fontweight="bold")
ax.legend(loc="lower right",fontsize=8,framealpha=0.9)
ax.grid(alpha=0.15)
# minute:second ticks
xt=np.arange(0,6.01,0.5)
ax.set_xticks(xt); ax.set_xticklabels([f"{int(x)}:{int((x%1)*60):02d}" for x in xt])
plt.tight_layout(); plt.savefig(OUT+"/03_final_arrangement.png",dpi=110); plt.close()
print("done")
