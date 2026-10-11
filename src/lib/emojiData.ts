/**
 * Circuit Community — the emoji picker's set. A curated list, not the
 * full Unicode catalog: the phone keyboard's own emoji panel already
 * covers "everything"; this picker is for fast access on desktop and the
 * reactions people actually use in a gaming chat. Plain Unicode — no
 * image sprites — so every emoji renders in the viewer's own system font.
 */

export type EmojiCategory = { key: string; label: string; icon: string; emojis: string[] };

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    key: "smileys",
    label: "Smileys",
    icon: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘",
      "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏",
      "😒", "🙄", "😬", "😮‍💨", "🤥", "😌", "😔", "😪", "😴", "😷", "🤒", "🤕", "🥵", "🥶", "😵", "🤯",
      "🤠", "🥳", "😎", "🤓", "🧐", "😕", "😟", "🙁", "😮", "😯", "😲", "😳", "🥺", "😦", "😨", "😰",
      "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈",
      "💀", "☠️", "💩", "🤡", "👻", "👽", "🤖", "😺",
    ],
  },
  {
    key: "gestures",
    label: "Gestures",
    icon: "👍",
    emojis: [
      "👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✌️", "🤞", "🤟", "🤘",
      "👌", "🤌", "🤏", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤙", "💪", "🫡",
      "🫶", "👀", "🧠", "🫵",
    ],
  },
  {
    key: "gaming",
    label: "Gaming",
    icon: "🎮",
    emojis: [
      "🎮", "🕹️", "👾", "🎯", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "⚔️", "🗡️", "🛡️", "🔫", "💣", "🧨",
      "💥", "🔥", "⚡", "💯", "🚀", "🎲", "♟️", "🃏", "⚽", "🏀", "🏈", "🎾", "🏎️", "🏁", "⏱️", "📶",
      "🎧", "🖥️", "💻", "📱", "⌨️", "🖱️", "📺", "🎥",
    ],
  },
  {
    key: "hearts",
    label: "Hearts",
    icon: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "💕", "💞", "💓", "💗", "💖",
      "💘", "💝", "✨", "⭐", "🌟", "💫", "🎉", "🎊",
    ],
  },
  {
    key: "food",
    label: "Food",
    icon: "🍕",
    emojis: [
      "🍕", "🍔", "🍟", "🌭", "🍗", "🍖", "🌮", "🍜", "🍚", "🍛", "🍲", "🥘", "🍿", "🍩", "🍪", "🎂",
      "🍫", "🍬", "☕", "🥤", "🧃", "🍺", "🥂", "🍾",
    ],
  },
  {
    key: "symbols",
    label: "Symbols",
    icon: "✅",
    emojis: [
      "✅", "❌", "⭕", "❗", "❓", "‼️", "⁉️", "⚠️", "🚫", "💤", "💢", "💬", "🗯️", "💭", "🔔", "📢",
      "🆗", "🆕", "🆒", "🔝", "🔴", "🟢", "🟡", "🔵", "⬆️", "⬇️", "➡️", "⬅️", "🔁", "🇳🇬",
    ],
  },
];
