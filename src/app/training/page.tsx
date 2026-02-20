import React from 'react';
import Image from 'next/image';

export default function TrainingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header - 使用提取的背景图片 */}
      <header className="relative text-white py-16 shadow-2xl overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src="/assets/images/img-000.png"
            alt="背景"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/90 via-purple-600/90 to-indigo-600/90"></div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h1 className="text-5xl md:text-6xl font-bold mb-4">🤖 2026年AI技术培训</h1>
          <p className="text-2xl text-blue-100 mb-3">AI领域应用场景简介</p>
          <p className="text-sm text-blue-200 tracking-widest">实战导向 · 即学即用 · 提升效率</p>
          <div className="mt-8 inline-block bg-white/10 backdrop-blur-sm rounded-lg px-6 py-3">
            <p className="text-sm text-blue-100">培训日期：2026年</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* 技术概念 - 在文字说明后插入图片 */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-3">
            <span className="text-4xl">🤖</span>
            <span>技术概念</span>
          </h2>
          
          {/* 大模型 */}
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6 border-2 border-purple-100 hover:shadow-2xl transition-shadow">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1 order-2 md:order-1">
                <h3 className="text-2xl font-bold text-purple-900 mb-4">🧠 大模型</h3>
                <div className="bg-purple-50 rounded-xl p-6 border-l-4 border-purple-500 mb-4">
                  <p className="text-purple-700 text-lg leading-relaxed mb-2">
                    <strong>对话 + 推理 + 联网 + 多模态</strong>
                  </p>
                  <p className="text-gray-600">AI可以像人类一样进行对话交流，具备逻辑推理能力，可以联网获取实时信息，并理解处理文本、图像、音频等多种模态的内容。</p>
                </div>
              </div>
              <div className="w-full md:w-1/3 order-1 md:order-2">
                <div className="relative aspect-square">
                  <Image
                    src="/assets/images/img-002.png"
                    alt="大模型示意图"
                    fill
                    className="object-contain rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 提示词 */}
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6 border-2 border-blue-100 hover:shadow-2xl transition-shadow">
            <div className="flex flex-col md:flex-row-reverse items-center gap-8">
              <div className="flex-1 order-2 md:order-1">
                <h3 className="text-2xl font-bold text-blue-900 mb-4">💡 提示词</h3>
                <div className="bg-blue-50 rounded-xl p-6 border-l-4 border-blue-500 mb-4">
                  <p className="text-blue-700 text-lg leading-relaxed mb-2">
                    <strong>背景 + 要求 + 限制</strong>
                  </p>
                  <p className="text-gray-600">通过提供清晰的背景信息、明确的要求和必要的限制条件，可以让AI更准确地理解任务需求，生成更符合期望的结果。</p>
                </div>
              </div>
              <div className="w-full md:w-1/3 order-1 md:order-2">
                <div className="relative aspect-square">
                  <Image
                    src="/assets/images/img-001.png"
                    alt="提示词示意图"
                    fill
                    className="object-contain rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 多模态和限制 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-green-100 hover:shadow-2xl transition-shadow">
              <h3 className="text-2xl font-bold text-green-900 mb-4">🎨 多模态</h3>
              <div className="bg-green-50 rounded-xl p-6 border-l-4 border-green-500 mb-4">
                <p className="text-green-700 text-lg leading-relaxed mb-2">
                  <strong>音频 + 图片 + 视频</strong>
                </p>
                <p className="text-gray-600 text-sm">AI可以理解和生成多种媒体形式的内容，实现跨模态的信息处理和转换。</p>
              </div>
              <div className="relative h-48">
                <Image
                  src="/assets/images/img-005.png"
                  alt="多模态"
                  fill
                  className="object-contain"
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-red-100 hover:shadow-2xl transition-shadow">
              <h3 className="text-2xl font-bold text-red-900 mb-4">⚠️ 限制</h3>
              <div className="bg-red-50 rounded-xl p-6 border-l-4 border-red-500 mb-4">
                <p className="text-red-700 text-lg leading-relaxed mb-2">
                  <strong>注意幻觉问题</strong>
                </p>
                <p className="text-gray-600 text-sm">AI可能会生成不准确或虚构的内容（称为"幻觉"），需要人工验证和判断。</p>
              </div>
              <div className="relative h-48">
                <Image
                  src="/assets/images/img-006.png"
                  alt="限制"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
          </div>
        </section>

        {/* 提示词示例 - 插入核心示意图 */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-3">
            <span className="text-4xl">💬</span>
            <span>提示词示例</span>
          </h2>
          
          <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-amber-200 mb-6">
            <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">问题定位</h3>
            
            {/* 核心示意图 */}
            <div className="mb-8 relative w-full" style={{ height: '400px' }}>
              <Image
                src="/assets/images/img-004.png"
                alt="提示词结构示意图"
                fill
                className="object-contain rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6">
                <h4 className="text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
                  <span className="text-xl">❌</span>
                  <span>错误示范</span>
                </h4>
                <div className="bg-white p-4 rounded-lg border border-red-200">
                  <p className="text-gray-700 text-base italic">&quot;帮我写一份交通疏导方案&quot;</p>
                </div>
                <p className="text-sm text-red-600 mt-3">⚠️ 缺少背景信息和具体要求</p>
              </div>

              <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6">
                <h4 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
                  <span className="text-xl">✅</span>
                  <span>正确示范</span>
                </h4>
                <div className="bg-white p-5 rounded-lg border border-green-200 space-y-3">
                  <div>
                    <div className="bg-blue-100 text-blue-800 px-3 py-1.5 rounded-lg border border-blue-300 font-bold text-sm mb-2 inline-block">
                      （背景）
                    </div>
                    <p className="text-gray-700 text-sm leading-relaxed">
                      我是公路科技治超领域的项目实施工程师，项目位于深圳市宝安区雪花科技大厦北侧留仙三路，道路双向6车道。需从慢车道至快车道逐条车道施工，现在需要写一份交通疏导方案。
                    </p>
                  </div>
                  <div>
                    <div className="bg-green-100 text-green-800 px-3 py-1.5 rounded-lg border border-green-300 font-bold text-sm mb-2 inline-block">
                      （要求）
                    </div>
                    <p className="text-gray-700 text-sm leading-relaxed">
                      内容包含：工程概况，设计准则，交通组织方案，交通安全应急方案。
                    </p>
                  </div>
                  <div>
                    <div className="bg-purple-100 text-purple-800 px-3 py-1.5 rounded-lg border border-purple-300 font-bold text-sm mb-2 inline-block">
                      （限制）
                    </div>
                    <p className="text-gray-700 text-sm leading-relaxed">
                      字数3000字，要有封面，预留落款署名和日期填写区域。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 一、知识库 */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-purple-700 mb-8">一、知识库</h2>
          <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-purple-100">
            <div className="bg-purple-50 rounded-xl p-6 border-l-4 border-purple-500">
              <div className="text-lg font-bold text-purple-900 mb-3 flex items-center gap-2">
                <span>💭</span>
                <span>Question：控屏软件如何设置？</span>
              </div>
              <div className="text-gray-700 text-sm pl-8">
                <p><strong>Answer：</strong>（待补充具体答案）</p>
              </div>
            </div>
          </div>
        </section>

        {/* 二、复杂日志文件分析 */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-blue-700 mb-8">二、复杂日志文件分析（非敏感数据）</h2>
          
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-blue-100">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-2xl">📊</span>
                <span>日志清洗与定位</span>
              </h3>
              <div className="bg-blue-50 rounded-xl p-6 border-l-4 border-blue-500">
                <p className="text-gray-700 mb-4 text-sm">直接把几兆的Log文件丢给AI（注意脱敏，如：核心代码、密码、客户实名信息等），输入指令：</p>
                <div className="bg-white p-4 rounded-lg border border-blue-200 font-mono text-sm text-blue-900">
                  &quot;帮我分析这个时间段内的异常报错，并统计出出现频率最高的3个错误类型。&quot;
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-green-100">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-2xl">🔄</span>
                <span>异构数据转换</span>
              </h3>
              <div className="bg-green-50 rounded-xl p-6 border-l-4 border-green-500">
                <div className="bg-white p-4 rounded-lg border border-green-200 font-mono text-sm text-green-900 mb-3">
                  &quot;这里有一段A厂家的JSON数据，帮我写一段Python脚本或Excel公式，把它转换成我们要导入B系统的CSV格式。&quot;
                </div>
                <p className="text-green-700 text-sm italic font-semibold">
                  ——这对懂一点技术的实施人员是绝佳的提效工具。
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-orange-100">
              <h3 className="text-xl font-bold text-orange-700 mb-4 flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <span>痛点：几百个摄像头IP需要修改，或者几千个点位需要测试通断</span>
              </h3>
              <div className="bg-orange-50 rounded-xl p-6 border-l-4 border-orange-500">
                <p className="text-gray-700 mb-3 font-semibold">一次性工具生成：</p>
                <p className="text-gray-700 mb-3 text-sm">用AI生成&quot;一次性脚本&quot;。例如：</p>
                <div className="bg-white p-4 rounded-lg border border-orange-200 font-mono text-sm text-orange-900 mb-3">
                  &quot;帮我写个Bat脚本，自动Ping 192.168.1.1到1.254，把通的IP保存到桌面txt里。&quot;
                </div>
                <p className="text-orange-700 text-sm italic font-semibold">
                  ——这是高效处理简单重复工作的重要提效技能。
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-red-100">
              <h3 className="text-xl font-bold text-red-700 mb-4 flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <span>痛点：实施经理要和难缠的监理、甲方开会，如果你没准备好，就被对方牵着鼻子走</span>
              </h3>
              <div className="bg-red-50 rounded-xl p-6 border-l-4 border-red-500">
                <p className="text-gray-700 mb-3 font-semibold">对手模拟：</p>
                <p className="text-gray-700 mb-3 text-sm">在去开会前，让AI扮演&quot;挑剔的甲方工程师&quot;：</p>
                <div className="bg-white p-4 rounded-lg border border-red-200 font-mono text-sm text-red-900 mb-3">
                  &quot;我们的项目延期了，原因是有两个：一是现场具备条件晚了，二是物流卡了。你现在扮演甲方，你要极力刁难我，并试图想扣我司款项。来，我们模拟三轮对话，帮我找出我的逻辑漏洞。&quot;
                </div>
                <p className="text-red-700 text-sm italic font-semibold">
                  ——这能为谈判和沟通技巧带来巨大的参考价值。
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-purple-100">
              <h3 className="text-xl font-bold text-purple-700 mb-4 flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <span>痛点：项目做完了，经验都在老员工脑子里，人一走，经验清零。项目文档也是乱七八糟</span>
              </h3>
              <div className="bg-purple-50 rounded-xl p-6 border-l-4 border-purple-500">
                <p className="text-gray-700 mb-3 font-semibold">项目复盘Bot：</p>
                <p className="text-gray-700 mb-3 text-sm">把项目群里几个月的聊天记录（脱敏导出）、所有会议纪要、邮件往来，全部整理出来投喂给AI。提问：</p>
                <div className="bg-white p-4 rounded-lg border border-purple-200 font-mono text-sm text-purple-900 mb-3">
                  &quot;分析这个项目中，导致进度延误频率最高的三个非技术原因是什么？我们是在哪个环节失控的？&quot;
                </div>
                <p className="text-purple-700 text-sm italic font-semibold">
                  ——这能给项目管理做宏观诊断。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 三、高难度沟通与扯皮防御 */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-indigo-700 mb-8">三、高难度沟通与扯皮防御</h2>
          
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-indigo-100">
              <h3 className="text-xl font-bold text-indigo-700 mb-4 flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <span>痛点：项目实施中，甲方需求变更频繁且不认账；售后面对愤怒的客户，技术人员往往由于&quot;情商直男&quot;或者&quot;解释过于技术化&quot;，导致矛盾激化</span>
              </h3>
              <div className="bg-indigo-50 rounded-xl p-6 border-l-4 border-indigo-500">
                <p className="text-gray-700 mb-3 font-semibold">提示词示例：</p>
                <div className="bg-white p-4 rounded-lg border border-indigo-200 font-mono text-sm text-indigo-900">
                  &quot;我查出来是数据库死锁导致的，你帮我生成一段回复给不懂技术的客户，既要说明这不是我们的代码Bug，是服务器配置过低，又要让他听得懂且愿意加钱升级配置。不得偏离事实，这会涉及商业诚信风险。要基于客观技术事实进行润色，不要捏造不存在的故障原因，重点在于解释技术原理和强调升级带来的性能提升。&quot;
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-blue-100">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-2xl">📋</span>
                <span>会议纪要与责任锁定</span>
              </h3>
              <p className="text-gray-700 mb-4 text-sm">现场开会经常是口头承诺。录音转文字后，让AI：</p>
              <div className="bg-blue-50 rounded-xl p-4 border-l-4 border-blue-500">
                <div className="bg-white p-4 rounded-lg border border-blue-200 font-mono text-sm text-blue-900">
                  &quot;提取所有甲方的承诺和我的待办事项，并生成一份正式的会议纪要邮件，语气要委婉但必须确认是甲方要求变更的。&quot;
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-pink-100">
              <h3 className="text-xl font-bold text-pink-700 mb-4 flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <span>痛点：项目卡在验收环节，甲方一直拖，借口这里不行那里不行。技术人员去催容易把关系搞僵</span>
              </h3>
              <div className="bg-pink-50 rounded-xl p-6 border-l-4 border-pink-500">
                <p className="text-gray-700 mb-3 font-semibold">情绪与利益转换：</p>
                <p className="text-gray-700 mb-3 text-sm">输入背景：</p>
                <div className="bg-white p-4 rounded-lg border border-pink-200 font-mono text-sm text-pink-900">
                  &quot;A项目已调试完毕3个月，甲方以&apos;领导没空&apos;为由拖延验收。其实是因为他们资金紧张。我要发一条微信给甲方项目总，既要表达我们垫资的压力，又要给足他面子，暗示如果不验收可能会影响后续维保服务。&quot;
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 四、提问技巧 */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-teal-700 mb-8">四、提问技巧</h2>
          <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-amber-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6">
                <h4 className="text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
                  <span className="text-xl">❌</span>
                  <span>错误示范</span>
                </h4>
                <div className="bg-white p-4 rounded-lg border border-red-200">
                  <p className="text-gray-700 text-base italic">&quot;设备坏了怎么办？&quot;</p>
                </div>
                <p className="text-sm text-red-600 mt-3">⚠️ 缺少上下文和具体信息</p>
              </div>

              <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6">
                <h4 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
                  <span className="text-xl">✅</span>
                  <span>正确示范</span>
                </h4>
                <div className="bg-white p-4 rounded-lg border border-green-200">
                  <p className="text-gray-700 text-sm leading-relaxed">
                    &quot;我是售后工程师，现场设备型号为X-2000，固件版本V3.1。现在出现连接超时（附上报错截图）。我已经尝试过重启和重置IP，无效。请根据技术手册，给出接下来需要排查的3个硬件节点和2个软件配置项。&quot;
                  </p>
                </div>
                <p className="text-sm text-green-600 mt-3">✅ 包含完整背景、设备信息和已尝试的步骤</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400 text-lg mb-2">© 2026 AI技术培训 | 实战导向 · 即学即用 · 提升效率</p>
          <p className="text-sm text-gray-500 mt-2">基于GitHub项目: HachikoJ/training</p>
        </div>
      </footer>
    </div>
  );
}
