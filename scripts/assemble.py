from pathlib import Path
import base64,json
root=Path(__file__).resolve().parent.parent
data=json.loads((root/"henan.json").read_text())
places=[dict(p,source="curated",hours=None,price=None,tel=None) for p in data["places"]]
html=(root/"app.html").read_text().replace("/*SITE_STYLES*/",(root/"styles.css").read_text()+"\n"+(root/"showcase.css").read_text()+"\n"+(root/"decision.css").read_text()+"\n"+(root/"ui.css").read_text()).replace("/*DECISION_CORE*/",(root/"decision-core.mjs").read_text().replace("export ","")).replace("/*DECISION_CODE*/",(root/"decision.js").read_text()).replace("/*SHOWCASE_CODE*/",(root/"showcase.js").read_text()).replace("/*JOURNEY_CODE*/",(root/"journey.js").read_text()).replace("/*HENAN_DATA*/[]",json.dumps(places,ensure_ascii=False)).replace("/*HENAN_ROUTES*/[]",json.dumps(data["routes"],ensure_ascii=False))
photos={name:base64.b64encode((root/(name+".jpg")).read_bytes()).decode() for name in sorted({Path(p["image"].split("?",1)[0]).stem for p in places if p.get("image")})}
(root/"worker").mkdir(parents=True, exist_ok=True)
(root/"worker/index.js").write_text("export const HTML = "+json.dumps(html,ensure_ascii=False)+";\nexport const CATALOG = "+json.dumps(places,ensure_ascii=False)+";\nexport const PRESETS = "+json.dumps(data["routes"],ensure_ascii=False)+";\nconst PHOTOS = "+json.dumps(photos)+";\n"+(root/"decision-core.mjs").read_text()+"\n"+(root/"server.mjs").read_text())
