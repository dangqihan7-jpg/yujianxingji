# 首页语音输入：协议与验收记录

## 2026-10-26 交付复核（2026-10-27 收尾）

复核基线为 `40f9abcd6b1aaa5b010557f77352b0835b71f90d`。接口、首页入口与竞态修复在此前已经提交，本轮保留已有实现，仅补齐当前协议说明、复现步骤和验收记录，不重新实现听写、不部署服务器。

| 已有提交 | 内容 |
| --- | --- |
| [`c4af30b`](https://github.com/dangqihan7-jpg/yujianxingji/commit/c4af30b80cec835f6f22c5003a3f763714cbc630) | 新增首页讯飞语音输入、PCM听写接口与小时限流，补充测试和验收记录。 |
| [`2f4a330`](https://github.com/dangqihan7-jpg/yujianxingji/commit/2f4a3307240bbc1abd6059c87687b0c2fe98a3f5) | 录音计时、取消与重新录音、提示保留；修复首页首次渲染早于共享状态初始化的问题。 |
| [`2d9b3b0`](https://github.com/dangqihan7-jpg/yujianxingji/commit/2d9b3b0655fe3cc77c7db3ce8ed78ab9e07c7c1d) | 后端取消和超时测试改为等待异步签名及对应连接真实就绪，避免靠固定事件循环次数等待。 |

已完成代码与模拟验收：固定讯飞听写服务、独立凭据、音频处理、失败降级、取消与迟到响应隔离、前后端测试。待人工完成：**党启涵本人确认讯飞应用已开通“语音听写（流式版）”、填写服务器凭据，并进行真人麦克风验收**。GPT没有代为确认开通，也没有宣称真人识别成功。本轮不读取服务器env，不用本地无配置测试推断生产凭据的当前状态。

## 接口、配置与音频协议

首页点击“语音输入”才申请麦克风权限，再点“结束录音”上传。识别结果追加到返回时输入框的最新文字之后，用户仍可编辑，**不会自动提交规划或改行程**。最长60秒；超过600字容纳空间时保留原文，在单独文本框显示完整识别文字供复制，不静默截断。

`POST /api/stt` 接收原始16kHz、16bit有符号小端、单声道PCM，`Content-Type: application/octet-stream`，最大1,920,000字节。它不接收WAV、WebM、MP3或base64 JSON。前端使用原生麦克风与Web Audio，优先AudioWorklet，必要时回退ScriptProcessor；44.1/48kHz采样会重采样为16kHz PCM16LE。成功响应只有 `{"text":"识别文字"}`。

| 情况 | HTTP状态 | 说明 |
| --- | --- | --- |
| 空录音、奇数字节、已知WAV/压缩音频容器头或读取失败 | 400 | 显示具体中文提示，不调用上游。 |
| 服务未配置、配置不正确或额度数据库不可用 | 503 | 明确说明暂不可用；不能用假文字返回成功。 |
| 讯飞连接、服务、结果解析或超时失败 | 502 | 返回友好中文错误，不回传上游私密细节或签名URL。 |
| 小时额度用完 | 429 | 提示稍后再试，用户可继续打字。 |
| 超过60秒对应的PCM字节上限 | 413 | 拒绝上传。 |
| 不支持的Content-Type | 415 | 要求原始PCM。 |
| 请求Origin与本站不一致 | 403 | 拒绝跨站识别请求。 |
| 不支持的方法 | 405 | 只接受POST。 |
| 请求在完成前取消 | 408 | 关闭上游、清理资源，不追加迟到文字。 |

服务端独立读取 `XF_ASR_APPID`、`XF_ASR_APIKEY`、`XF_ASR_APISECRET`，**不读取或复用 `XF_VISION_*`**。三项需来自同一听写应用；`scripts/dev.mjs` 已将它们加入服务端白名单，仓库 `.env.example` 只有空变量名。真实值只由党启涵填入服务器 `/etc/yujianxingji.env`，权限600，不进入源码、浏览器、日志或本报告。配置后由党启涵重启服务；本轮不执行部署或重启。

后端使用[讯飞语音听写（流式版）](https://www.xfyun.cn/doc/asr/voicedictation/API.html)的固定地址 `wss://iat-api.xfyun.cn/v2/iat`，通过HMAC-SHA256签名连接。每帧最多1280字节，按40ms音频时钟发送，第一帧状态0、后续1、最后空帧2。按序号 `sn` 累积首选文字并去重，未启用动态修正。乱序结果会按序拼接；缺段、冲突结果及未完成上传就提前结束均返回失败，不悄悄丢弃后半段。

“流式版”指服务端向讯飞WebSocket分片发送并累积结果；浏览器先录音、结束后通过一次HTTP上传，拿到完整JSON才填字，不把等待过程描述成边录边显示实时转写。后端握手8秒、整个上游会话85秒，前端上传及响应体等待上限100秒。60秒录音结束后仍需等待逐帧上传。此时按钮显示“识别中…”，状态为“录音已结束，正在上传并识别；可取消，不会自动提交规划”，没有预计耗时或虚构进度。

限流复用 `model_usage`，使用独立 `stt:` scope，按UTC小时整点重置：匿名3次、登录用户10次、全局100次。只有合法、已配置且通过额度检查的请求才尝试上游，上游失败尝试仍计数；没有数据库时拒绝服务。服务端不存储录音或识别内容，额度表只存计数与必要的匿名标识。

## 前端生命周期与降级

- 等待权限、录音和上传识别均可取消；录音显示真实计时及60秒上限。取消释放麦克风、音频节点与定时器，并终止上传。
- 页面隐藏、离开首页、打开弹窗、重绘首页或开始手动规划时清理录音；迟到的权限、AudioWorklet加载和网络响应不能覆盖当前输入或新会话。
- 取消旧识别后立即新录音，旧响应不能停止新会话、重置新时钟或写入文字。`pagehide`事件不会被误当成状态文案。
- 识别失败后“重新录音”开始新的一次采集，不自动重发旧音频。503与429分别提示联系站长或稍后再试，原有文字保留。
- 麦克风不可用、权限被拒绝或不在安全上下文时，语音按钮置灰，键盘输入仍可用。页面加载不自动申请权限。
- 首页初始渲染在共享模块状态初始化之后，支持麦克风的浏览器不会因提前读取 `briefBusy` 而中断绑定。详细UX记录见 [stt-ux.md](stt-ux.md)。

## 可复现的隔离测试

以下命令从已提交源码创建独立副本。构建、测试生成的Worker、离线页、SQLite和 `competition-evidence` 时间戳文件都留在该副本，不修改交付工作区或提交证据JSON。要求Node.js 24+、Git、Python3。

```sh
stt_check_dir=$(mktemp -d)
git archive HEAD | tar -xf - -C "$stt_check_dir"
cd "$stt_check_dir"
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run validate
npm run test:stt
npm test
```

`npm run test:stt` 使用模拟WebSocket和麦克风、真实隔离SQLite，当前包含后端13组与前端31组。成功文字“郑州周末两天”来自测试fixture，前端追加文字也由fixture提供，**不是对真人音频的实测识别**。这些测试覆盖HMAC、分片和60秒边界、乱序去重、上游错误/超时/提前关闭、取消、小时限流、权限拒绝、重采样、追加/溢出、晚到请求与完整首页绑定。

完整 `npm test` 还覆盖现有规划、地图适配、保存、海报、分享、识图和问答；上游均按各套件的模拟设置运行，不用真实模型测试代替真人验收。

在上述副本中另起一个**不带任何讯飞凭据**的本地服务；保持该终端运行：

```sh
env -i PATH="$PATH" LANG=C.UTF-8 STANDALONE_AUTH=true TRAVEL_DEV_PORT=8814 node scripts/dev.mjs
```

在第二个终端生成非真人录音的合成零字节测试数据，再逐个发送请求。若8814已被占用，请换空闲端口，并同步修改服务端口和 `stt_check_origin`。

```sh
stt_check_origin=http://127.0.0.1:8814
stt_pcm_dir=$(mktemp -d)
python3 - "$stt_pcm_dir" <<'PYDATA'
from pathlib import Path
import sys
folder = Path(sys.argv[1])
(folder / 'empty.pcm').write_bytes(b'')
(folder / 'small.pcm').write_bytes(bytes(1280))
(folder / 'odd.pcm').write_bytes(bytes(3))
(folder / 'oversize.pcm').write_bytes(bytes(1920002))
(folder / 'container.wav').write_bytes(b'RIFF' + bytes(40))
PYDATA

curl -i -H 'Content-Type: application/octet-stream' --data-binary @"$stt_pcm_dir/empty.pcm" "$stt_check_origin/api/stt"
curl -i -H 'Content-Type: application/octet-stream' --data-binary @"$stt_pcm_dir/small.pcm" "$stt_check_origin/api/stt"
curl -i -H 'Content-Type: application/octet-stream' --data-binary @"$stt_pcm_dir/odd.pcm" "$stt_check_origin/api/stt"
curl -i -H 'Content-Type: application/octet-stream' --data-binary @"$stt_pcm_dir/oversize.pcm" "$stt_check_origin/api/stt"
curl -i -H 'Content-Type: application/json' --data-binary @"$stt_pcm_dir/small.pcm" "$stt_check_origin/api/stt"
curl -i -H 'Content-Type: application/octet-stream' --data-binary @"$stt_pcm_dir/container.wav" "$stt_check_origin/api/stt"
curl -i -H 'Content-Type: application/octet-stream' -H 'Origin: https://unrelated.invalid' --data-binary @"$stt_pcm_dir/small.pcm" "$stt_check_origin/api/stt"
curl -i "$stt_check_origin/api/stt"
```

## 本轮实际结果（2026-10-26，北京时间）

检查范围是本地隔离Node服务 `127.0.0.1:8814` 和模拟上游测试；没有读取服务器env、连接真实听写服务、录制真人声音、部署或重启线上服务。本地服务故意不配置 `XF_ASR_*`，以下503是预期的明确拒绝，不表示服务崩溃。

| 本地实际请求 | 实际状态 | 实际返回的中文提示 |
| --- | --- | --- |
| 空PCM | 400 | 录音为空，请先说话再识别 |
| 1280字节全零PCM，无听写配置 | 503 | 语音识别服务尚未配置 |
| 3字节PCM | 400 | 请上传16位原始PCM录音 |
| 1,920,002字节PCM | 413 | 录音不能超过60秒 |
| `application/json` 上传 | 415 | 请上传16kHz、16位、单声道原始PCM录音 |
| `RIFF`加40字节的WAV容器 | 400 | 请上传原始PCM录音，不支持WAV或压缩音频 |
| 其他站点的Origin | 403 | 语音识别请求来源不正确 |
| GET | 405 | 方法不支持 |

| 模拟验收项目 | 本轮结果 | 边界 |
| --- | --- | --- |
| 后端13组（含200成功、502错误/超时、408取消和429额度） | 已复跑通过 | WebSocket由测试替身提供；200不是实时调用讯飞的结果。 |
| 前端31组（含文字追加、取消旧请求后新录音、断连/超时与初始化） | 已复跑通过 | 麦克风、音频节点和网络均为模拟，没有真人识别结论。 |
| 最终源码的完整 `npm test` 30套件 | 已复跑全绿；`npm run build`、`npm run validate` 同时通过 | 2026-10-26在隔离副本执行，2026-10-27收尾提交；未调用真实模型，不沿用此前历史结果。 |

本轮仓库凭据检查未发现真实密钥、含鉴权参数的完整签名URL、私密env文件或非空环境示例赋值；测试源码里明确命名的假凭据仅用于mock。检查结果不等于获知了服务器上的私密配置。

## 历史记录说明

下面保留2026-10-23部署核对原文，不改其当时的22组前端测试数量、旧HTML哈希、备份路径或凭据结论；它不代表2026-10-26再次部署、当前生产配置或真人识别成功。

## 实际部署核对（2026-10-23，北京时间）

- 站长关闭TUN/设目标IP直连后，本机到服务器路由恢复`en1`，部署成功。此前不完整上传已触发回滚，没有将失败尝试写成上线成功。
- 部署前源码、Worker、Nginx及SQLite在线备份：`/var/backups/yujianxingji/stt-20261023-151254/`。数据库完整性为ok；部署前后均为用户2、草稿2、分享3，没有回写或还原数据库。
- 本地与服务器均通过 `npm run build`、`npm run validate`、完整 `npm test`（30个套件）。新增后端13组、前端22组检查全部使用模拟WebSocket/麦克风，未调用真实讯飞服务。
- 原`competition-evidence` JSON未变：本地在独立副本跑全量测试，服务器也在临时副本跑；通过前后字节/哈希比较确认，未提交该目录改动。
- 公网HTTPS返回200、TLS证书校验成功；获取的完整首页与本地已测试构建逐字节一致，含麦克风入口。HTML SHA-256：`b666b689b4dae5bb3057dfc09538514def7ad87c520231fff0bd347d928800f5`。
- 公网实际HTTP检查：空PCM→400（“录音为空，请先说话再识别”）；1280字节及完整1,920,000字节PCM→503（“语音识别服务尚未配置”）；1,920,002字节→413（“录音不能超过60秒”）；GET接口→405。没有因为检查而调用真实上游或扣听写额度。
- Nginx实际配置包含仅`/api/stt`的100秒读取超时；`yujianxingji`、`nginx`和证书续期timer均active。`.local → /var/lib/yujianxingji`、权限600的私密环境文件及内容哈希均保留。
- 三项`XF_ASR_*`本轮仍未配置，按任务要求未等待或代填凭据；站长需完成下面的开通、配置和真人验收。
- 本地内置浏览器实际检查桌面与375px宽iframe预览：麦克风入口可见，桌面按钮约100×46px，键盘输入仍可编辑。375px不是iOS真机录音。截图保存在维护证据目录，不冒充线上真人识别截图；线上内置浏览器控制读取超时，所以公网验证使用HTTPS接口和完整HTML字节核对，没有声称已自动点击线上麦克风。

## 真人麦克风验收：待党启涵本人确认后完成

**尚未进行真人说话识别，不能声称已识别成功。** 党启涵须在讯飞控制台为对应应用确认已开通“语音听写（流式版）”，再独立填写服务器 `XF_ASR_APPID`、`XF_ASR_APIKEY`、`XF_ASR_APISECRET` 并重启服务。GPT不代替他确认、开通或宣称已经开通。本轮不部署，不能将历史开通/凭据状态当作当日事实。

配置完成后，由党启涵在 [线上网站](https://112.124.35.179/) 用自己的设备操作：

1. 确认HTTPS正常，输入框先写“周末出发”，点击麦克风并允许权限。
2. 说“郑州出发两天，想去洛阳博物馆，预算八百元”，再点“结束录音”。
3. 原样记录实际识别文字（含错误）：**待真人验收填写，不预填预期值**。
4. 核对文字是否追加在“周末出发”之后、是否仍可手动修改；页面不得自行生成或应用行程。
5. 分别在录音及识别中点取消，再开始新录音；确认原输入不丢失，旧结果不写入，麦克风指示与计时结束。拒绝权限后仍能正常打字。
6. 记录设备/浏览器、日期、控制台开通确认、识别是否准确、结果是否进入输入框及任何中文错误：**待真人验收填写**。

若提示未配置，检查同一听写应用三件套、服务开通、保存后重启；若上游失败，检查应用权限/额度、服务器时钟与外连443。只记录安全的中文错误和状态，不把真实密钥、音频、完整签名URL或账号信息放进GitHub、聊天和报告。真人失败应记录真实失败，不能以mock通过替代。
