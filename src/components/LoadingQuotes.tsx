'use client'

import { useState, useEffect } from 'react'
import { Language } from '@/lib/i18n'
import { CustomQuote } from '@/lib/store'

// 预设金句（用于初始化）- 100条古今中外经典金句
export const defaultQuotesZh: CustomQuote[] = [
  // 费曼相关
  { text: '如果你不能简单地解释它，你就没有真正理解它。', author: '理查德·费曼', isPreset: true },
  { text: '我宁愿有不能回答的问题，也不要有不能质疑的答案。', author: '理查德·费曼', isPreset: true },
  { text: '学习的第一原则是：不要欺骗自己，而你是最容易被欺骗的人。', author: '理查德·费曼', isPreset: true },
  { text: '知道一个东西的名字和真正理解它是两回事。', author: '理查德·费曼', isPreset: true },
  { text: '我们在寻找一种新的思考方式。', author: '理查德·费曼', isPreset: true },
  { text: '科学是一种方法，它教会我们如何不被自己愚弄。', author: '理查德·费曼', isPreset: true },
  
  // 爱因斯坦
  { text: '想象力比知识更重要，因为知识是有限的。', author: '阿尔伯特·爱因斯坦', isPreset: true },
  { text: '教育就是当一个人把在学校所学全部忘光之后剩下的东西。', author: '阿尔伯特·爱因斯坦', isPreset: true },
  { text: '我没有特别的天赋，我只是极度好奇。', author: '阿尔伯特·爱因斯坦', isPreset: true },
  { text: '逻辑会把你从A带到B，想象力能带你去任何地方。', author: '阿尔伯特·爱因斯坦', isPreset: true },
  { text: '学习知识要善于思考，思考，再思考。', author: '阿尔伯特·爱因斯坦', isPreset: true },
  { text: '我没有特殊的才能，只有强烈的好奇心。', author: '阿尔伯特·爱因斯坦', isPreset: true },
  { text: '想象力比知识更重要，因为知识是有限的，而想象力概括着世界的一切。', author: '阿尔伯特·爱因斯坦', isPreset: true },
  
  // 毛泽东
  { text: '学习的敌人是自己的满足，要认真学习一点东西，必须从不自满开始。', author: '毛泽东', isPreset: true },
  { text: '饭可以一日不吃，觉可以一日不睡，书不可以一日不读。', author: '毛泽东', isPreset: true },
  { text: '读书是学习，使用也是学习，而且是更重要的学习。', author: '毛泽东', isPreset: true },
  { text: '情况是在不断地变化，要使自己的思想适应新的情况，就得学习。', author: '毛泽东', isPreset: true },
  { text: '学习需要钻进去，也需要跳出来。', author: '毛泽东', isPreset: true },
  { text: '世上无难事，只要肯登攀。', author: '毛泽东', isPreset: true },
  { text: '虚心使人进步，骄傲使人落后。', author: '毛泽东', isPreset: true },
  { text: '人是要有一点精神的。', author: '毛泽东', isPreset: true },
  { text: '自信人生二百年，会当水击三千里。', author: '毛泽东', isPreset: true },
  { text: '雄关漫道真如铁，而今迈步从头越。', author: '毛泽东', isPreset: true },
  
  // 中国古代智慧
  { text: '学而不思则罔，思而不学则殆。', author: '孔子', isPreset: true },
  { text: '知之为知之，不知为不知，是知也。', author: '孔子', isPreset: true },
  { text: '温故而知新，可以为师矣。', author: '孔子', isPreset: true },
  { text: '三人行，必有我师焉。', author: '孔子', isPreset: true },
  { text: '学而时习之，不亦说乎。', author: '孔子', isPreset: true },
  { text: '敏而好学，不耻下问。', author: '孔子', isPreset: true },
  { text: '读书破万卷，下笔如有神。', author: '杜甫', isPreset: true },
  { text: '纸上得来终觉浅，绝知此事要躬行。', author: '陆游', isPreset: true },
  { text: '书山有路勤为径，学海无涯苦作舟。', author: '韩愈', isPreset: true },
  { text: '问渠那得清如许，为有源头活水来。', author: '朱熹', isPreset: true },
  { text: '业精于勤，荒于嬉；行成于思，毁于随。', author: '韩愈', isPreset: true },
  { text: '黑发不知勤学早，白首方悔读书迟。', author: '颜真卿', isPreset: true },
  { text: '书犹药也，善读之可以医愚。', author: '刘向', isPreset: true },
  { text: '读万卷书，行万里路。', author: '刘彝', isPreset: true },
  { text: '尽信书不如无书。', author: '孟子', isPreset: true },
  
  // 西方哲学家
  { text: '我思故我在。', author: '笛卡尔', isPreset: true },
  { text: '读书而不思考，等于吃饭而不消化。', author: '埃德蒙·伯克', isPreset: true },
  { text: '真正的无知不是知识的缺乏，而是拒绝获取知识。', author: '卡尔·波普尔', isPreset: true },
  { text: '知识就是力量。', author: '弗朗西斯·培根', isPreset: true },
  { text: '我唯一知道的就是我一无所知。', author: '苏格拉底', isPreset: true },
  { text: '未经审视的人生不值得过。', author: '苏格拉底', isPreset: true },
  { text: '教育的目的是让学生能够自我教育。', author: '托马斯·赫胥黎', isPreset: true },
  { text: '思维是灵魂的自我谈话。', author: '柏拉图', isPreset: true },
  
  // 现代思想家
  { text: '活到老，学到老。', author: '梭伦', isPreset: true },
  { text: '学习永远不晚。', author: '马克西姆·高尔基', isPreset: true },
  { text: '书籍是人类进步的阶梯。', author: '马克西姆·高尔基', isPreset: true },
  { text: '读一本好书，就是和许多高尚的人谈话。', author: '歌德', isPreset: true },
  { text: '经验是最好的老师，但学费太贵了。', author: '托马斯·卡莱尔', isPreset: true },
  { text: '书是人类进步的阶梯，终生的伴侣，最诚挚的朋友。', author: '马克西姆·高尔基', isPreset: true },
  
  // 关于阅读
  { text: '读书使人充实，讨论使人机智，笔记使人准确。', author: '弗朗西斯·培根', isPreset: true },
  { text: '不读书的人，思想就会停止。', author: '狄德罗', isPreset: true },
  { text: '读书是在别人思想的帮助下，建立起自己的思想。', author: '鲁巴金', isPreset: true },
  { text: '一个爱书的人，他必定不致于缺少一个忠实的朋友。', author: '伊萨克·巴罗', isPreset: true },
  { text: '书籍是全世界的营养品。', author: '莎士比亚', isPreset: true },
  { text: '读书好，好读书，读好书。', author: '冰心', isPreset: true },
  { text: '读书之法，在循序而渐进，熟读而精思。', author: '朱熹', isPreset: true },
  { text: '立身以立学为先，立学以读书为本。', author: '欧阳修', isPreset: true },
  
  // 关于思考
  { text: '思考是人类最大的乐趣。', author: '布莱希特', isPreset: true },
  { text: '独立思考能力是科学研究和创造发明的一项必备才能。', author: '华罗庚', isPreset: true },
  { text: '善于思考的人思想急速转变，不会思考的人晕头转向。', author: '克柳夫斯基', isPreset: true },
  { text: '思想是根基，理想是嫩绿的芽胚。', author: '雨果', isPreset: true },
  { text: '人的思想是了不起的，只要专注于某一项事业，就一定会做出使自己感到吃惊的成绩。', author: '马克·吐温', isPreset: true },
  
  // 关于实践
  { text: '实践是检验真理的唯一标准。', author: '邓小平', isPreset: true },
  { text: '光说不练假把式，光练不说傻把式，连说带练真把式。', author: '民间谚语', isPreset: true },
  { text: '一次行动胜过一打纲领。', author: '恩格斯', isPreset: true },
  { text: '知识是宝库，但开启这个宝库的钥匙是实践。', author: '托马斯·富勒', isPreset: true },
  { text: '耳闻之不如目见之，目见之不如足践之。', author: '刘向', isPreset: true },
  { text: '实践出真知。', author: '民间谚语', isPreset: true },
  
  // 关于坚持
  { text: '天才就是百分之一的灵感加上百分之九十九的汗水。', author: '托马斯·爱迪生', isPreset: true },
  { text: '成功的秘诀在于坚持自己的目标和信念。', author: '本杰明·狄斯雷利', isPreset: true },
  { text: '锲而舍之，朽木不折；锲而不舍，金石可镂。', author: '荀子', isPreset: true },
  { text: '骐骥一跃，不能十步；驽马十驾，功在不舍。', author: '荀子', isPreset: true },
  { text: '绳锯木断，水滴石穿。', author: '罗大经', isPreset: true },
  { text: '只要功夫深，铁杵磨成针。', author: '民间谚语', isPreset: true },
  { text: '宝剑锋从磨砺出，梅花香自苦寒来。', author: '民间谚语', isPreset: true },
  
  // 关于好奇心
  { text: '好奇心是学者的第一美德。', author: '玛丽·居里', isPreset: true },
  { text: '好奇心造就科学家和诗人。', author: '阿纳托尔·法朗士', isPreset: true },
  { text: '求知欲，好奇心——这是人的永恒的，不可改变的特性。', author: '苏霍姆林斯基', isPreset: true },
  
  // 关于智慧
  { text: '智慧源于勤奋，伟大出自平凡。', author: '民间谚语', isPreset: true },
  { text: '智慧是经验的女儿。', author: '列奥纳多·达·芬奇', isPreset: true },
  { text: '知识给人重量，成就给人光彩，大多数人只是看到了光彩，而不去称量重量。', author: '弗朗西斯·培根', isPreset: true },
  { text: '真正的智慧不仅在于能明察眼前，而且还能预见未来。', author: '忒壬斯', isPreset: true },
  { text: '智者千虑，必有一失；愚者千虑，必有一得。', author: '史记', isPreset: true },
  
  // 关于创新
  { text: '创新是一个民族进步的灵魂。', author: '江泽民', isPreset: true },
  { text: '创造力来源于不同事物的意外组合。', author: '查尔斯·汤普森', isPreset: true },
  { text: '创新就是创造一种资源。', author: '彼得·德鲁克', isPreset: true },
  { text: '距离已经消失，要么创新，要么死亡。', author: '托马斯·彼得斯', isPreset: true },
  
  // 关于目标与理想
  { text: '有志者事竟成。', author: '后汉书', isPreset: true },
  { text: '志当存高远。', author: '诸葛亮', isPreset: true },
  { text: '理想是指路明灯。没有理想，就没有坚定的方向。', author: '列夫·托尔斯泰', isPreset: true },
  { text: '一个人追求的目标越高，他的才力就发展得越快。', author: '高尔基', isPreset: true },
  
  // 关于时间
  { text: '时间就是生命，时间就是速度，时间就是力量。', author: '郭沫若', isPreset: true },
  { text: '一寸光阴一寸金，寸金难买寸光阴。', author: '民间谚语', isPreset: true },
  { text: '少壮不努力，老大徒伤悲。', author: '汉乐府', isPreset: true },
  { text: '莫等闲，白了少年头，空悲切。', author: '岳飞', isPreset: true },
  
  // 关于方法
  { text: '工欲善其事，必先利其器。', author: '孔子', isPreset: true },
  { text: '授人以鱼不如授人以渔。', author: '民间谚语', isPreset: true },
  { text: '好的方法能使我们更好地发挥运用天赋的才能。', author: '笛卡尔', isPreset: true }
]

export const defaultQuotesEn: CustomQuote[] = [
  { text: '如果你不能简单地解释它，你就没有真正理解它。', author: '理查德·费曼', isPreset: true },
  { text: '学习的最好方式是教别人。', author: '费曼学习法', isPreset: true },
  { text: '知识的诅咒：一旦你知道了某件事，就很难想象不知道它是什么感觉。', author: '认知心理学', isPreset: true },
  { text: '真正的理解是能用自己的话重新表达。', author: '费曼学习法', isPreset: true },
  { text: '发现自己不懂的地方，才是学习真正开始的时候。', author: '费曼学习法', isPreset: true },
  { text: '类比是理解复杂概念的钥匙。', author: '费曼学习法', isPreset: true },
  { text: '不要被术语吓倒，每个术语背后都是简单的概念。', author: '理查德·费曼', isPreset: true },
  { text: '读书不在多，而在于精。', author: '古训', isPreset: true },
  { text: '尽信书不如无书。', author: '孟子', isPreset: true },
  { text: '学而不思则罔，思而不学则殆。', author: '孔子', isPreset: true }
]

interface Props {
  lang: Language
  quotes?: CustomQuote[]
}

export default function LoadingQuotes({ lang, quotes = [] }: Props) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    // 初始就随机选择一个
    const displayQuotes = quotes.length > 0 ? quotes : (lang === 'zh' ? defaultQuotesZh : defaultQuotesEn)
    return Math.floor(Math.random() * displayQuotes.length)
  })
  const [fade, setFade] = useState(true)

  // 如果没有金句，使用默认的
  const displayQuotes = quotes.length > 0 ? quotes : (lang === 'zh' ? defaultQuotesZh : defaultQuotesEn)

  useEffect(() => {
    if (displayQuotes.length === 0) return
    
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        // 完全随机选择下一个金句
        setCurrentIndex(() => Math.floor(Math.random() * displayQuotes.length))
        setFade(true)
      }, 300)
    }, 4000)

    return () => clearInterval(interval)
  }, [displayQuotes.length])

  if (displayQuotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="relative mb-8">
          <div className="w-16 h-16 border-4 border-[var(--accent)]/30 rounded-full"></div>
          <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-[var(--accent)] rounded-full animate-spin"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl">📚</div>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          {lang === 'zh' ? 'AI 正在深度分析中，请稍候...' : 'AI is analyzing, please wait...'}
        </p>
      </div>
    )
  }

  const quote = displayQuotes[currentIndex]

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* Loading Animation */}
      <div className="relative mb-8">
        <div className="w-16 h-16 border-4 border-[var(--accent)]/30 rounded-full"></div>
        <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-[var(--accent)] rounded-full animate-spin"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl">📚</div>
      </div>

      {/* Quote */}
      <div className={`text-center max-w-md transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-lg mb-2 text-[var(--text-primary)]">"{quote.text}"</p>
        <p className="text-sm text-[var(--text-secondary)]">— {quote.author}</p>
      </div>

      {/* Progress Dots */}
      <div className="flex gap-2 mt-6">
        {Array.from({ length: Math.min(5, displayQuotes.length) }).map((_, idx) => (
          <div
            key={idx}
            className={`w-2 h-2 rounded-full transition-all ${
              idx === currentIndex % 5 ? 'bg-[var(--accent)] w-4' : 'bg-[var(--border)]'
            }`}
          />
        ))}
      </div>

      <p className="text-sm text-[var(--text-secondary)] mt-6">
        {lang === 'zh' ? 'AI 正在深度分析中，请稍候...' : 'AI is analyzing, please wait...'}
      </p>
    </div>
  )
}
