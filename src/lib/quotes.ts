export const FEYNMAN_QUOTES = {
  zh: [
    '"如果你不能简单地解释它，你就没有真正理解它。" — 费曼',
    '"我宁愿有不能回答的问题，也不要有不能质疑的答案。" — 费曼',
    '"学习的第一原则是：不要欺骗自己，而你是最容易被欺骗的人。" — 费曼',
    '"知道一个东西的名字和真正理解它是两回事。" — 费曼',
    '"我们在寻找一种新的思考方式。" — 费曼',
    '"科学是一种方法，它教会我们如何不被自己愚弄。" — 费曼',
    '"最重要的是不要停止提问。" — 爱因斯坦',
    '"读书而不思考，等于吃饭而不消化。" — 波尔克',
    '"真正的无知不是知识的缺乏，而是拒绝获取知识。" — 波普尔',
    '"教是最好的学。" — 古罗马谚语'
  ],
  en: [
    '"If you can\'t explain it simply, you don\'t understand it well enough." — Feynman',
    '"I would rather have questions that can\'t be answered than answers that can\'t be questioned." — Feynman',
    '"The first principle is that you must not fool yourself — and you are the easiest person to fool." — Feynman',
    '"There\'s a big difference between knowing the name of something and knowing something." — Feynman',
    '"We are trying to find a new way of thinking." — Feynman',
    '"Science is a way of trying not to fool yourself." — Feynman',
    '"The important thing is not to stop questioning." — Einstein',
    '"Reading without reflecting is like eating without digesting." — Burke',
    '"True ignorance is not the absence of knowledge, but the refusal to acquire it." — Popper',
    '"To teach is to learn twice." — Joseph Joubert'
  ]
}

export function getRandomQuote(lang: 'zh' | 'en'): string {
  const quotes = FEYNMAN_QUOTES[lang]
  return quotes[Math.floor(Math.random() * quotes.length)]
}
