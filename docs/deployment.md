# 独立部署与配置

## 本地
Node.js 24+、Python 3。执行 npm ci、npm run build、npm run validate、npm test、npm run dev。入口 http://127.0.0.1:8787。复制 .env.example 到 .env 后填入自己的值，可用 node --env-file=.env scripts/dev.mjs 加载文件。空配置可以运行规则模式。

## Worker
wrangler.jsonc 是新部署模板，原项目使用 Sites 托管，没有原生 Wrangler 配置。先构建，再使用 Wrangler 创建 D1 数据库，将返回的 database_id 替换全零占位值。执行 D1 migrations apply（database_name 为 yujianxingji，migrations_dir 为 drizzle）。用 Wrangler secret put 配置高德与模型变量，再执行 Wrangler deploy。本次未执行外部部署。

## 身份
原后端依赖 Sites dispatcher 注入 oai-authenticated-user-id。独立部署须在可信网关中删除用户提交的该头、验证登录，再注入可信身份；完成前不要开放云端草稿保存。公开模型演示须配置 D1 与额度。环境变量示例只有空值，默认不开启。

## 服务配置
AMAP_JS_KEY 为浏览器 Key；AMAP_SECURITY_JS_CODE、AMAP_WEB_SERVICE_KEY 留在后端。LLM_API_KEY、LLM_BASE_URL、LLM_MODEL 配置模型接口。真实上游服务与国内访问效果需要在目标部署环境重新验证。

## 文件
前端作者文件、server.mjs、完整 worker/index.js、迁移、测试、照片均提交。Worker 由 assemble.py 生成，修改作者文件后重新构建。dist/build、依赖、真实环境配置、日志、临时文件排除。index-offline.html 通过 node scripts/offline.mjs 重建，不计为缺失源码。
