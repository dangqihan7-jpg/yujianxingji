from pathlib import Path
import base64,json
root=Path(__file__).resolve().parent.parent
data=json.loads((root/"henan.json").read_text())
places=[dict(p,source="curated",hours=None,price=None,tel=None) for p in data["places"]]
city_guides=data["cities"]
html=(root/"app.html").read_text().replace("/*SITE_STYLES*/",(root/"styles.css").read_text()+"\n"+(root/"showcase.css").read_text()+"\n"+(root/"decision.css").read_text()+"\n"+(root/"ui.css").read_text()).replace("/*DECISION_CORE*/",(root/"decision-core.mjs").read_text().replace("export ","")).replace("/*DECISION_CODE*/",(root/"decision.js").read_text()).replace("/*SHOWCASE_CODE*/",(root/"showcase.js").read_text()).replace("/*JOURNEY_CODE*/",(root/"journey.js").read_text()).replace("/*HENAN_DATA*/[]",json.dumps(places,ensure_ascii=False)).replace("/*HENAN_ROUTES*/[]",json.dumps(data["routes"],ensure_ascii=False))
photos={name:base64.b64encode((root/(name+".jpg")).read_bytes()).decode() for name in sorted({Path(p["image"].split("?",1)[0]).stem for p in places if p.get("image")})}
html=html.replace("/*HENAN_CITIES*/[]",json.dumps(city_guides,ensure_ascii=False))
html=html.replace("<!--CITY_OPTIONS-->",''.join('<option value="'+c['name']+'">'+c['name']+'</option>' for c in city_guides))
html=html.replace("<!--COVERAGE_SUMMARY-->",f"覆盖河南 {len(city_guides)} 个市级目的地（含济源），{len(places)} 个精选地点与 {len(data['routes'])} 条可编辑示例路线。地点详情附资料来源；路线组合不代表交通、票务或营业已确认。")
(root/"worker").mkdir(parents=True, exist_ok=True)
(root/"worker/index.js").write_text("export const HTML = "+json.dumps(html,ensure_ascii=False)+";\nexport const CATALOG = "+json.dumps(places,ensure_ascii=False)+";\nexport const PRESETS = "+json.dumps(data["routes"],ensure_ascii=False)+";\nexport const CITY_GUIDES = "+json.dumps(city_guides,ensure_ascii=False)+";\nconst PHOTOS = "+json.dumps(photos)+";\n"+(root/"decision-core.mjs").read_text()+"\n"+(root/"travel-agent.mjs").read_text()+"\n"+(root/"server.mjs").read_text())
