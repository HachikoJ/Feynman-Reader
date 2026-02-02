export type Language = 'zh' | 'en'

export const translations = {
  zh: {
    app: {
      title: '费曼阅读法',
      subtitle: '用费曼学习法深度理解一本书',
      quote: '"如果你不能简单地解释它，你就没有真正理解它。"',
      quoteAuthor: '— 理查德·费曼'
    },
    nav: {
      bookshelf: '书架',
      reading: '阅读',
      settings: '设置'
    },
    settings: {
      title: '设置',
      apiKey: 'DeepSeek API Key',
      apiKeyPlaceholder: 'sk-...',
      apiKeyHelp: '密钥仅保存在本地浏览器中',
      getApiKey: '获取 API Key',
      language: '语言',
      theme: '主题',
      themeLight: '浅色',
      themeDark: '深色',
      themeCyber: '科技蓝',
      save: '保存设置',
      saved: '已保存'
    },
    bookshelf: {
      title: '我的书架',
      addBook: '添加书籍',
      bookName: '书名',
      bookNamePlaceholder: '输入书名...',
      author: '作者（选填）',
      authorPlaceholder: '输入作者...',
      add: '添加',
      cancel: '取消',
      empty: '书架空空如也，添加一本书开始阅读吧',
      tabs: {
        all: '全部',
        unread: '未读',
        reading: '在读',
        finished: '已读'
      },
      status: {
        unread: '未读',
        reading: '在读',
        finished: '已读'
      },
      startReading: '开始阅读',
      continueReading: '继续阅读',
      viewNotes: '查看笔记',
      delete: '删除',
      progress: '进度',
      tags: {
        title: '标签筛选',
        all: '全部标签',
        generating: '正在生成标签...',
        regenerate: '重新生成',
        noTags: '暂无标签',
        category: '分类'
      }
    },
    alert: {
      needApiKey: '需要配置 API Key',
      needApiKeyDesc: '使用 AI 分析功能前，请先在设置中配置 DeepSeek API Key',
      goSettings: '去设置',
      later: '稍后',
      dontRemind: '不再提醒'
    },
    reading: {
      currentBook: '正在阅读',
      changeBook: '换一本书',
      phase: '阶段',
      explore: '探索这个问题',
      thinking: '思考中...',
      askMore: '继续提问',
      askPlaceholder: '输入你的问题...',
      ask: '提问',
      nextPhase: '完成此阶段，进入下一步',
      completed: '已完成',
      congrats: '恭喜完成费曼阅读之旅！',
      congratsDesc: '你已经全面深度地理解了这本书'
    },
    phases: {
      background: {
        title: '背景探索',
        subtitle: '了解作者与时代',
        desc: '在阅读之前，先了解作者是谁、写作背景、时代环境，剥开文本的"外衣"'
      },
      overview: {
        title: '全书概览',
        subtitle: '建立整体框架',
        desc: '用最简单的语言理解这本书在讲什么，建立整体认知框架'
      },
      deepDive: {
        title: '深度拆解',
        subtitle: '以教代学',
        desc: '假装你要教别人这本书的内容，找出自己理解的盲点'
      },
      critical: {
        title: '辩证分析',
        subtitle: '批判性思考',
        desc: '与书"吵架"，主动寻找漏洞和反面观点'
      },
      reception: {
        title: '众声回响',
        subtitle: '后世评价与影响',
        desc: '了解这本书在历史上的评价和影响，校准自己的理解'
      },
      synthesis: {
        title: '融会贯通',
        subtitle: '建立连接',
        desc: '将这本书与你的知识体系和生活经验连接起来'
      }
    },
    practice: {
      title: '费曼实践',
      subtitle: '用输出检验理解',
      teach: '教学模拟',
      teachDesc: '假装向一个完全不懂的人解释这本书的核心观点，这是费曼学习法的核心环节',
      teachPlaceholder: '用你自己的话，像教小白一样解释这本书的核心内容...\n\n建议包含：\n1. 这本书主要讲什么？\n2. 核心观点是什么？\n3. 为什么这些观点重要？\n4. 用一个生活中的例子说明',
      notes: '阅读笔记',
      notesPlaceholder: '记录你的思考、疑问、收获...',
      review: 'AI 点评',
      getReview: '提交评估',
      reviewPrompt: '请点评我的理解是否准确、全面，指出遗漏和误解',
      save: '保存笔记',
      history: '实践记录',
      noHistory: '暂无实践记录',
      score: '评分',
      passed: '合格',
      notPassed: '未合格',
      passRequired: '需要通过费曼实践评估才能完成阅读',
      bestScore: '综合得分',
      deleteRecord: '删除',
      accuracy: '准确度',
      completeness: '完整度',
      clarity: '清晰度',
      overall: '综合',
      minChars: '至少输入200字才能提交评估',
      submitting: '评估中...',
      criticChallenge: '批评者挑战',
      criticChallengeDesc: '让刁钻的批评者挑战你的理解',
      startChallenge: '开始挑战',
      generating: '生成中...',
      allResolved: '全部应对成功',
      yourResponse: '你的回应：',
      aiEvaluation: 'AI 评价：',
      lastEvaluation: '上次评价：',
      respondPlaceholder: '如何回应这个挑战？',
      submitResponses: '提交回应',
      evaluating: '评估中...',
      challengeSummary: '挑战总结',
      weakPoints: '被攻破的弱点：',
      suggestions: '加固建议：',
      resolved: '已应对'
    },
    result: {
      summary: '核心要点',
      keyInsights: '关键洞察',
      details: '详细分析',
      myNotes: '我的笔记'
    }
  },
  en: {
    app: {
      title: 'Feynman Reading',
      subtitle: 'Deeply understand a book with the Feynman Technique',
      quote: '"If you can\'t explain it simply, you don\'t understand it well enough."',
      quoteAuthor: '— Richard Feynman'
    },
    nav: {
      bookshelf: 'Bookshelf',
      reading: 'Reading',
      settings: 'Settings'
    },
    settings: {
      title: 'Settings',
      apiKey: 'DeepSeek API Key',
      apiKeyPlaceholder: 'sk-...',
      apiKeyHelp: 'Key is stored locally in your browser only',
      getApiKey: 'Get API Key',
      language: 'Language',
      theme: 'Theme',
      themeLight: 'Light',
      themeDark: 'Dark',
      themeCyber: 'Cyber Blue',
      save: 'Save Settings',
      saved: 'Saved'
    },
    bookshelf: {
      title: 'My Bookshelf',
      addBook: 'Add Book',
      bookName: 'Book Title',
      bookNamePlaceholder: 'Enter book title...',
      author: 'Author (optional)',
      authorPlaceholder: 'Enter author...',
      add: 'Add',
      cancel: 'Cancel',
      empty: 'Your bookshelf is empty. Add a book to start reading!',
      tabs: {
        all: 'All',
        unread: 'Unread',
        reading: 'Reading',
        finished: 'Finished'
      },
      status: {
        unread: 'Unread',
        reading: 'Reading',
        finished: 'Finished'
      },
      startReading: 'Start Reading',
      continueReading: 'Continue',
      viewNotes: 'View Notes',
      delete: 'Delete',
      progress: 'Progress',
      tags: {
        title: 'Filter by Tags',
        all: 'All Tags',
        generating: 'Generating tags...',
        regenerate: 'Regenerate',
        noTags: 'No tags',
        category: 'Category'
      }
    },
    alert: {
      needApiKey: 'API Key Required',
      needApiKeyDesc: 'Please configure your DeepSeek API Key in settings before using AI features',
      goSettings: 'Go to Settings',
      later: 'Later',
      dontRemind: 'Don\'t remind again'
    },
    reading: {
      currentBook: 'Currently Reading',
      changeBook: 'Change Book',
      phase: 'Phase',
      explore: 'Explore this question',
      thinking: 'Thinking...',
      askMore: 'Ask more',
      askPlaceholder: 'Enter your question...',
      ask: 'Ask',
      nextPhase: 'Complete this phase, go to next',
      completed: 'Completed',
      congrats: 'Congratulations!',
      congratsDesc: 'You have deeply understood this book'
    },
    phases: {
      background: {
        title: 'Background',
        subtitle: 'Author & Context',
        desc: 'Understand who the author is, the writing background, and the era context'
      },
      overview: {
        title: 'Overview',
        subtitle: 'Build Framework',
        desc: 'Understand what the book is about in the simplest terms'
      },
      deepDive: {
        title: 'Deep Dive',
        subtitle: 'Learn by Teaching',
        desc: 'Pretend you\'re teaching someone else, find your blind spots'
      },
      critical: {
        title: 'Critical Analysis',
        subtitle: 'Challenge Ideas',
        desc: 'Argue with the book, find flaws and counterarguments'
      },
      reception: {
        title: 'Reception',
        subtitle: 'Historical Impact',
        desc: 'Understand how the book was received and its influence'
      },
      synthesis: {
        title: 'Synthesis',
        subtitle: 'Connect Knowledge',
        desc: 'Connect the book to your existing knowledge and experience'
      }
    },
    practice: {
      title: 'Feynman Practice',
      subtitle: 'Test understanding through output',
      teach: 'Teaching Simulation',
      teachDesc: 'Explain the core ideas as if teaching someone who knows nothing - this is the core of the Feynman Technique',
      teachPlaceholder: 'Explain in your own words, as if teaching a beginner...\n\nSuggested structure:\n1. What is this book mainly about?\n2. What are the core ideas?\n3. Why are these ideas important?\n4. Give a real-life example',
      notes: 'Reading Notes',
      notesPlaceholder: 'Record your thoughts, questions, insights...',
      review: 'AI Review',
      getReview: 'Submit for Review',
      reviewPrompt: 'Please review if my understanding is accurate and complete',
      save: 'Save Notes',
      history: 'Practice History',
      noHistory: 'No practice records yet',
      score: 'Score',
      passed: 'Passed',
      notPassed: 'Not Passed',
      passRequired: 'Must pass Feynman practice to complete reading',
      bestScore: 'Final Score',
      deleteRecord: 'Delete',
      accuracy: 'Accuracy',
      completeness: 'Completeness',
      clarity: 'Clarity',
      overall: 'Overall',
      minChars: 'Minimum 200 characters required',
      submitting: 'Evaluating...',
      criticChallenge: 'Critic Challenge',
      criticChallengeDesc: 'Let critics challenge your understanding',
      startChallenge: 'Start Challenge',
      generating: 'Generating...',
      allResolved: 'All Resolved',
      yourResponse: 'Your Response:',
      aiEvaluation: 'AI Evaluation:',
      lastEvaluation: 'Last Evaluation:',
      respondPlaceholder: 'How do you respond?',
      submitResponses: 'Submit Responses',
      evaluating: 'Evaluating...',
      challengeSummary: 'Challenge Summary',
      weakPoints: 'Weak Points:',
      suggestions: 'Suggestions:',
      resolved: 'Resolved'
    },
    result: {
      summary: 'Key Points',
      keyInsights: 'Key Insights',
      details: 'Detailed Analysis',
      myNotes: 'My Notes'
    }
  }
}

export function t(lang: Language, key: string): string {
  const keys = key.split('.')
  let value: any = translations[lang]
  for (const k of keys) {
    value = value?.[k]
  }
  return value || key
}
