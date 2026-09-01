"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Check,
  Cloud,
  Download,
  ExternalLink,
  FileDown,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  accountLoginHref,
  getAccount,
  getActivityCalendar,
  getCloudData,
  getCloudBookSummaries,
  getCloudSettings,
  getRecycleBin,
  getMigrationState,
  getUserDataSummary,
  importLocalData,
  isAccountRequired,
  isWatchaOAuthEnabled,
  logout,
  mergePasswordAccount,
  migrateLocalData,
  type AccountUser,
  type ActivityDay,
  type MigrationState,
  type RecycleBinItem,
  type UserDataSummary,
} from "@/lib/accountClient";
import {
  clearMigratedLocalData,
  dismissLocalMigrationNotice,
  inspectLocalMigration,
  type LocalMigrationSnapshot,
} from "@/lib/accountMigration";
import {
  clearAssistantMemories,
  deleteAssistantMemory,
  getAssistantMemories,
  type AssistantMemory,
} from "@/lib/assistantMemory";
import { deleteAssistantSession, getAssistantSessions } from "@/lib/assistantSessions";

interface CloudBook {
  id: string;
  name: string;
  author?: string;
  status: string;
  currentPhase: number;
  updatedAt: number;
  noteRecords?: unknown[];
  practiceRecords?: unknown[];
  qaPracticeRecords?: Array<{ questions?: unknown[] }>;
  recommendations?: string;
  noteCount?: number;
  practiceCount?: number;
  questionsDone?: number;
  questionsTotal?: number;
  hasRecommendations?: boolean;
}
interface CloudQuote {
  text: string;
  author: string;
  isPreset?: boolean;
}
interface CloudAssistantSession {
  sessionId: string;
  title: string;
  bookId: string | null;
  data: { messages?: unknown[] };
  createdAt: string;
  updatedAt: string;
}
type AccountTab =
  "overview" | "bookshelf" | "quotes" | "assistant" | "recycle" | "data";

const tabs: Array<{
  id: AccountTab;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "bookshelf", label: "云端书架", icon: Archive },
  { id: "quotes", label: "金句管理", icon: Cloud },
  { id: "assistant", label: "费曼小助手", icon: UserRound },
  { id: "recycle", label: "回收站", icon: Trash2 },
  { id: "data", label: "数据管理", icon: Download },
];

function createPreviewData(): {
  user: AccountUser;
  summary: UserDataSummary;
  books: CloudBook[];
  quotes: CloudQuote[];
  sessions: CloudAssistantSession[];
  memories: AssistantMemory[];
  recycle: RecycleBinItem[];
} {
  const now = Date.now();
  return {
    user: { id: "local-preview", email: "preview@example.test" },
    summary: {
      books: 4,
      notes: 18,
      practices: 9,
      qaRecords: 6,
      aiUsageRecords: 27,
      lists: 2,
      relations: 5,
      quotes: 3,
      assistantSessions: 3,
      assistantMemories: 2,
      storageBytes: 2_450_000,
      lastImportAt: new Date(now - 2 * 86400000).toISOString(),
      lastSyncAt: new Date(now - 35 * 60000).toISOString(),
    },
    books: [
      {
        id: "preview-book-1",
        name: "人类简史",
        author: "尤瓦尔·赫拉利",
        status: "reading",
        currentPhase: 3,
        noteRecords: [{}, {}, {}, {}, {}],
        practiceRecords: [{}, {}],
        qaPracticeRecords: [
          { questions: [{ score: 82 }, { userAnswer: "已回答" }, {}] },
        ],
        recommendations: "",
        updatedAt: now - 35 * 60000,
      },
      {
        id: "preview-book-2",
        name: "思考，快与慢",
        author: "丹尼尔·卡尼曼",
        status: "finished",
        currentPhase: 6,
        noteRecords: [{}, {}, {}, {}, {}, {}, {}, {}],
        practiceRecords: [{}, {}, {}, {}],
        qaPracticeRecords: [
          { questions: [{ score: 90 }, { score: 88 }, { score: 85 }] },
        ],
        recommendations: '{"related":[]}',
        updatedAt: now - 2 * 86400000,
      },
      {
        id: "preview-book-3",
        name: "置身事内",
        author: "兰小欢",
        status: "unread",
        currentPhase: 0,
        noteRecords: [],
        practiceRecords: [],
        qaPracticeRecords: [],
        recommendations: "",
        updatedAt: now - 5 * 86400000,
      },
      {
        id: "preview-book-4",
        name: "卡片笔记写作法",
        author: "申克·阿伦斯",
        status: "reading",
        currentPhase: 2,
        noteRecords: [{}, {}],
        practiceRecords: [{}, {}],
        qaPracticeRecords: [{ questions: [{ userAnswer: "已回答" }, {}] }],
        recommendations: "",
        updatedAt: now - 8 * 86400000,
      },
    ],
    quotes: [
      {
        text: "重要的不是你读了多少，而是你能解释多少。",
        author: "费曼读书助手",
      },
      { text: "一个人的知识结构，决定了他看见什么。", author: "用户摘录" },
      {
        text: "如果你不能简单地解释它，你就没有真正理解它。",
        author: "理查德·费曼",
        isPreset: true,
      },
    ],
    sessions: [
      {
        sessionId: "preview-session-1",
        title: "人类简史：认知革命",
        bookId: "preview-book-1",
        data: { messages: [{}, {}, {}, {}] },
        createdAt: new Date(now - 86400000).toISOString(),
        updatedAt: new Date(now - 20 * 60000).toISOString(),
      },
      {
        sessionId: "preview-session-2",
        title: "把复杂概念讲给孩子听",
        bookId: null,
        data: { messages: [{}, {}, {}] },
        createdAt: new Date(now - 4 * 86400000).toISOString(),
        updatedAt: new Date(now - 3 * 86400000).toISOString(),
      },
      {
        sessionId: "preview-session-3",
        title: "思考，快与慢：系统一与系统二",
        bookId: "preview-book-2",
        data: { messages: [{}, {}, {}, {}, {}, {}] },
        createdAt: new Date(now - 10 * 86400000).toISOString(),
        updatedAt: new Date(now - 6 * 86400000).toISOString(),
      },
    ],
    memories: [
      {
        id: "preview-memory-1",
        content: "解释概念时先给一个生活中的例子。",
        category: "learning-style",
        createdAt: now - 3 * 86400000,
        updatedAt: now - 3 * 86400000,
      },
      {
        id: "preview-memory-2",
        content: "每次复习控制在 20 分钟以内。",
        category: "workflow",
        createdAt: now - 86400000,
        updatedAt: now - 86400000,
      },
    ],
    recycle: [
      {
        bookId: "preview-deleted-1",
        name: "刻意练习",
        author: "安德斯·艾利克森",
        deletedAt: new Date(now - 2 * 86400000).toISOString(),
        restoreUntil: new Date(now + 5 * 86400000).toISOString(),
      },
      {
        bookId: "preview-deleted-2",
        name: "学会提问",
        author: "尼尔·布朗",
        deletedAt: new Date(now - 6 * 86400000).toISOString(),
        restoreUntil: new Date(now + 1 * 86400000).toISOString(),
      },
    ],
  };
}

function formatDate(value: string | null): string {
  if (!value) return "暂无记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "暂无记录"
    : date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const amount = value / 1024 ** unitIndex;
  return `${amount >= 100 || unitIndex === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unitIndex]}`;
}

function bookProgress(book: CloudBook): {
  notes: number;
  practice: number;
  questionsDone: number;
  questionsTotal: number;
  recommendations: boolean;
} {
  const qaRecords = Array.isArray(book.qaPracticeRecords)
    ? book.qaPracticeRecords
    : [];
  const questions = qaRecords.flatMap((record) =>
    Array.isArray(record.questions) ? record.questions : [],
  );
  const questionsDone = questions.filter(
    (question) =>
      question &&
      typeof question === "object" &&
      (typeof (question as { score?: unknown }).score === "number" ||
        Boolean((question as { userAnswer?: unknown }).userAnswer)),
  ).length;
  return {
    notes: typeof book.noteCount === "number" ? book.noteCount : Array.isArray(book.noteRecords) ? book.noteRecords.length : 0,
    practice: typeof book.practiceCount === "number" ? book.practiceCount : Array.isArray(book.practiceRecords) ? book.practiceRecords.length : 0,
    questionsDone: typeof book.questionsDone === "number" ? book.questionsDone : questionsDone,
    questionsTotal: typeof book.questionsTotal === "number" ? book.questionsTotal : questions.length,
    recommendations: typeof book.hasRecommendations === "boolean" ? book.hasRecommendations : Boolean(book.recommendations?.trim()),
  };
}

function dateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function activityBounds(value: Date): { from: string; to: string } {
  const end = new Date(value);
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  const start = new Date(end);
  start.setDate(start.getDate() - 52 * 7 + 1);
  return { from: dateKey(start), to: dateKey(end) };
}

function activityWeeks(value: Date, count = 52): Date[][] {
  const end = new Date(value);
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  const start = new Date(end);
  start.setDate(start.getDate() - count * 7 + 1);
  return Array.from({ length: count }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(start);
      date.setDate(start.getDate() + weekIndex * 7 + dayIndex);
      return date;
    }),
  );
}

function previewActivity(bounds: { from: string; to: string }): ActivityDay[] {
  const start = new Date(`${bounds.from}T00:00:00`);
  const end = new Date(`${bounds.to}T00:00:00`);
  const days: ActivityDay[] = [];
  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const day = cursor.getDate();
    if (day % 3 === 0 || day % 7 === 0) {
      const reading = day % 3 === 0 ? 1 + (day % 3) : 0;
      const ai = day % 7 === 0 ? 2 : 0;
      const assistant = day % 5 === 0 ? 1 : 0;
      days.push({
        date: dateKey(cursor),
        count: reading + ai + assistant,
        categories: {
          ...(reading ? { reading } : {}),
          ...(ai ? { ai } : {}),
          ...(assistant ? { assistant } : {}),
        },
      });
    }
  }
  return days;
}

const activityCategoryLabels: Record<string, string> = {
  reading: "书籍更新",
  ai: "AI 使用",
  assistant: "助手会话",
  activity: "其他活动",
};
const assistantMemoryCategoryLabels: Record<string, string> = {
  preference: "偏好",
  "learning-style": "学习方式",
  goal: "目标",
  workflow: "工作流",
};

function ActivityCalendar({
  endDate,
  days,
  loading,
}: {
  endDate: Date;
  days: ActivityDay[];
  loading: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const maxCount = Math.max(1, ...days.map((day) => day.count));
  const weeks = activityWeeks(endDate);
  const intensity = (count: number): string => {
    if (!count) return "bg-[var(--bg-secondary)]";
    if (count / maxCount <= 0.25) return "bg-[var(--accent)]/25";
    if (count / maxCount <= 0.6) return "bg-[var(--accent)]/50";
    return "bg-[var(--accent)]";
  };
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const selectedActivity = selectedDate ? byDate.get(selectedDate) : null;
  const selectedLabel = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
  return (
    <div className="card p-3 sm:p-4" aria-label="用户活动日历">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">活动记录</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            近一年 · 点击日期查看详情
          </p>
        </div>
        <span className="text-xs text-[var(--text-secondary)]">
          {total} 次活动
        </span>
      </div>
      <div className="mt-3 overflow-x-auto pb-1" aria-live="polite">
        <div className="grid min-w-[640px] grid-cols-[1.25rem_minmax(0,1fr)] gap-2">
          <div className="pt-4" aria-hidden="true">
            <div className="grid grid-rows-7 gap-1 text-[9px] leading-none text-[var(--text-secondary)]">
              <span className="flex items-center">一</span>
              <span />
              <span className="flex items-center">三</span>
              <span />
              <span className="flex items-center">五</span>
              <span />
              <span />
            </div>
          </div>
          <div className="min-w-0">
            <div className="relative h-3 text-[9px] text-[var(--text-secondary)]">
              {weeks.map((week, weekIndex) => {
                const first = week[0];
                const showMonth =
                  weekIndex === 0 ||
                  first.getMonth() !== weeks[weekIndex - 1][0].getMonth();
                return showMonth ? (
                  <span
                    key={`month-${dateKey(first)}`}
                    className="absolute whitespace-nowrap"
                    style={{ left: `${(weekIndex / weeks.length) * 100}%` }}
                  >
                    {first.getMonth() + 1}月
                  </span>
                ) : null;
              })}
            </div>
            <div className="mt-1 grid grid-cols-[repeat(52,minmax(0,1fr))] gap-1">
              {weeks.map((week) => (
                <div key={dateKey(week[0])} className="grid grid-rows-7 gap-1">
                  {week.map((cell) => {
                    const cellDate = dateKey(cell);
                    const item = byDate.get(cellDate);
                    const categoryText = item
                      ? Object.entries(item.categories)
                          .map(
                            ([key, count]) =>
                              `${activityCategoryLabels[key] || key} ${count}`,
                          )
                          .join("，")
                      : "无活动";
                    const selected = selectedDate === cellDate;
                    return (
                      <button
                        key={cellDate}
                        type="button"
                        title={`${cellDate}：${item?.count || 0} 次，${categoryText}`}
                        aria-label={`${cellDate}：${item?.count || 0} 次，${categoryText}`}
                        aria-pressed={selected}
                        onClick={() =>
                          setSelectedDate((current) =>
                            current === cellDate ? null : cellDate,
                          )
                        }
                        className={`aspect-square w-full rounded-[2px] ${intensity(item?.count || 0)} ${selected ? "ring-2 ring-[var(--accent)] ring-offset-1" : ""}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {selectedDate && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]/45 px-3 py-2 text-xs">
          <div>
            <span className="font-medium">{selectedLabel}</span>
            <span className="ml-2 text-[var(--text-secondary)]">
              {selectedActivity?.count || 0} 次活动
            </span>
          </div>
          {selectedActivity ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[var(--text-secondary)]">
              {Object.entries(selectedActivity.categories).map(
                ([key, count]) => (
                  <span key={key}>
                    {activityCategoryLabels[key] || key} {count}
                  </span>
                ),
              )}
            </div>
          ) : (
            <span className="text-[var(--text-secondary)]">当天没有记录</span>
          )}
        </div>
      )}
      {loading && (
        <p className="mt-2 text-center text-xs text-[var(--text-secondary)]">
          正在读取活动记录…
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[10px] text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1">
          <i className="h-2.5 w-2.5 rounded-sm bg-[var(--bg-secondary)]" />无
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]/25" />少
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]/50" />中
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" />多
        </span>
      </div>
    </div>
  );
}

function downloadJson(payload: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Panel({
  title,
  icon: Icon,
  children,
  hint,
}: {
  title: string;
  icon: typeof LayoutDashboard;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-[var(--accent)]" aria-hidden="true" />
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        {hint && (
          <span className="hidden text-xs text-[var(--text-secondary)] sm:block">
            {hint}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-1 sm:pr-2">
        {children}
      </div>
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative mb-3 block shrink-0">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
        aria-hidden="true"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input-field min-h-11 w-full text-sm"
        style={{
          paddingLeft: "2.75rem",
          paddingRight: value ? "2.75rem" : "1rem",
        }}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
          aria-label="清除搜索"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </label>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const localPreview = !isAccountRequired();
  const watchaEnabled = isWatchaOAuthEnabled();
  const [activeTab, setActiveTab] = useState<AccountTab>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [profileUsername, setProfileUsername] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [showPasswordEditor, setShowPasswordEditor] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showAccountMigration, setShowAccountMigration] = useState(false);
  const [migrationUsername, setMigrationUsername] = useState("");
  const [migrationPassword, setMigrationPassword] = useState("");
  const [migrationConfirmed, setMigrationConfirmed] = useState(false);
  const profileAvatarInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cloudData, setCloudData] = useState<UserDataSummary | null>(null);
  const [cloudBooks, setCloudBooks] = useState<CloudBook[]>([]);
  const [cloudSettings, setCloudSettings] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [personalizationEnabled, setPersonalizationEnabled] = useState(true);
  const [quotes, setQuotes] = useState<CloudQuote[]>([]);
  const [editingQuoteIndex, setEditingQuoteIndex] = useState<number | null>(
    null,
  );
  const [quoteDraftText, setQuoteDraftText] = useState("");
  const [quoteDraftAuthor, setQuoteDraftAuthor] = useState("");
  const [newQuoteText, setNewQuoteText] = useState("");
  const [newQuoteAuthor, setNewQuoteAuthor] = useState("");
  const [assistantSessions, setAssistantSessions] = useState<
    CloudAssistantSession[]
  >([]);
  const [assistantMemories, setAssistantMemories] = useState<AssistantMemory[]>(
    [],
  );
  const [assistantMemoryError, setAssistantMemoryError] = useState<
    string | null
  >(null);
  const [assistantMemoryEnabled, setAssistantMemoryEnabled] = useState(true);
  const [recycleItems, setRecycleItems] = useState<RecycleBinItem[]>([]);
  const [activityRangeEnd] = useState(() => new Date());
  const [activityDays, setActivityDays] = useState<ActivityDay[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [localMigration, setLocalMigration] =
    useState<LocalMigrationSnapshot | null>(null);
  const [migrationState, setMigrationState] = useState<MigrationState | null>(
    null,
  );
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const requestedTab = search.get("tab") as AccountTab | null;
    if (requestedTab && tabs.some((tab) => tab.id === requestedTab))
      setActiveTab(requestedTab);
    if (search.get("accountMigration") === "completed")
      setMessage("原账号数据已合并，今后请只使用观猹登录。");
  }, []);

  const loadRecycleBin = async (): Promise<void> => {
    setRecycleItems(await getRecycleBin());
  };

  useEffect(() => {
    void getAccount()
      .then(async (account) => {
        if (!account.user && localPreview) {
          const preview = createPreviewData();
          setUser(preview.user);
          setProfileUsername(preview.user.username || "");
          setProfileName(preview.user.displayName || "");
          setProfileAvatar(preview.user.avatarUrl || "");
          setCloudData(preview.summary);
          setCloudBooks(preview.books);
          setRecycleItems(preview.recycle);
          setQuotes(preview.quotes);
          setAssistantSessions(preview.sessions);
          setAssistantMemories(preview.memories);
          setAssistantMemoryEnabled(true);
          setPersonalizationEnabled(true);
          return;
        }
        setUser(account.user);
        setProfileUsername(account.user?.username || "");
        setProfileName(account.user?.displayName || "");
        setProfileAvatar(account.user?.avatarUrl || "");
        if (!account.user) return;
        // The account identity is enough to render the shell. Cloud panels fill
        // in independently so database latency never blocks navigation.
        setLoading(false);
        const [data, remoteSettings, remoteBooks, localSnapshot] =
          await Promise.all([
            getUserDataSummary(),
            getCloudSettings(),
            getCloudBookSummaries(),
            inspectLocalMigration({ includeDismissed: true }),
          ]);
        setLocalMigration(localSnapshot);
        if (localSnapshot.hasData) {
          const remoteMigration = await getMigrationState(true).catch(
            () => null,
          );
          setMigrationState(remoteMigration);
        }
        setCloudData(data);
        const normalizedSettings = remoteSettings;
        setCloudSettings(normalizedSettings);
        setPersonalizationEnabled(
          normalizedSettings?.personalizationAnalyticsEnabled !== false,
        );
        setAssistantMemoryEnabled(
          normalizedSettings?.assistantMemoryEnabled !== false,
        );
        const quoteList = normalizedSettings?.quotes;
        setQuotes(
          Array.isArray(quoteList)
            ? quoteList.filter((quote): quote is CloudQuote =>
                Boolean(
                  quote &&
                  typeof quote === "object" &&
                  typeof (quote as CloudQuote).text === "string" &&
                  typeof (quote as CloudQuote).author === "string",
                ),
              )
            : [],
        );
        setCloudBooks(
          remoteBooks as CloudBook[],
        );
        // Non-critical panels load after the account shell is visible. Their
        // availability must not block the bookshelf, overview, or settings.
        setLoading(false);
        void Promise.all([
          getRecycleBin().then(items => setRecycleItems(items)),
          getAssistantSessions().then(sessions => setAssistantSessions(sessions.map(session => ({
            sessionId: session.id,
            title: session.title,
            bookId: session.bookId || null,
            data: session,
            createdAt: new Date(session.createdAt).toISOString(),
            updatedAt: new Date(session.updatedAt).toISOString(),
          })))),
          getAssistantMemories().then(items => setAssistantMemories(items)).catch(() => {
            setAssistantMemoryError("长期记忆暂时无法读取，请稍后重试。");
          }),
        ]).catch(reason => {
          setError(reason instanceof Error ? reason.message : "部分云端数据暂时无法读取。");
        });
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "账号服务暂时不可用。",
        ),
      )
      .finally(() => setLoading(false));
  }, [localPreview]);

  useEffect(() => {
    if (!user) return;
    const bounds = activityBounds(activityRangeEnd);
    if (localPreview) {
      setActivityDays(previewActivity(bounds));
      setActivityLoading(false);
      return;
    }
    let cancelled = false;
    setActivityLoading(true);
    void getActivityCalendar(bounds.from, bounds.to)
      .then((days) => {
        if (!cancelled) setActivityDays(days);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "活动日历暂时不可用。",
          );
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activityRangeEnd, localPreview, user]);

  const runBusy = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  };
  const handleSaveProfile = async () => {
    if (localPreview) {
      setMessage("本地预览模式不会修改账号资料。");
      return;
    }
    await runBusy(async () => {
      const accountName = (
        user?.hasPassword ? profileUsername : profileName
      ).trim();
      const response = await fetch("/api/auth/profile/", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(user?.hasPassword ? { username: accountName } : {}),
          displayName: accountName,
          avatarUrl: profileAvatar,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: AccountUser;
      };
      if (!response.ok || !data.user)
        throw new Error(data.error || "账号资料保存失败。");
      setUser(data.user);
      setProfileUsername(data.user.username || "");
      setProfileName(data.user.displayName || "");
      setProfileAvatar(data.user.avatarUrl || "");
      setShowNameEditor(false);
      setMessage("账号资料已更新。");
    });
  };
  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 1_000_000
    ) {
      setError("头像请使用 PNG、JPG 或 WebP 图片，大小不超过 1 MB。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setProfileAvatar(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  };
  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致。");
      return;
    }
    await runBusy(async () => {
      const response = await fetch("/api/auth/password/change/", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "修改密码失败。");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordEditor(false);
      setMessage("密码已更新。");
    });
  };
  const cancelNameEdit = () => {
    setProfileUsername(user?.username || "");
    setProfileName(user?.displayName || "");
    setShowNameEditor(false);
  };
  const cancelPasswordEdit = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowPasswordEditor(false);
  };
  const cancelAccountMigration = () => {
    setMigrationUsername("");
    setMigrationPassword("");
    setMigrationConfirmed(false);
    setShowAccountMigration(false);
  };
  const handleAccountMigration = async () => {
    if (!migrationConfirmed) {
      setError("请先确认迁移后原账号将永久停用。");
      return;
    }
    await runBusy(async () => {
      await mergePasswordAccount(migrationUsername, migrationPassword);
      router.replace("/account?accountMigration=completed");
      router.refresh();
    });
  };
  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    if (localPreview) {
      event.target.value = "";
      setMessage("本地预览模式不会写入云端数据。");
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await runBusy(async () => {
      const result = await importLocalData(JSON.parse(await file.text()));
      setCloudData(await getUserDataSummary());
      setMessage(
        `云端数据已合并：${result.booksImported} 本书、${result.aiUsageImported} 条 AI 使用记录。`,
      );
    });
  };
  const handleCloudExport = async () => {
    if (localPreview) {
      setMessage("本地预览模式不会导出云端数据。");
      return;
    }
    await runBusy(async () => {
      downloadJson(
        await getCloudData(),
        `feynman-cloud-backup-${new Date().toISOString().slice(0, 10)}.json`,
      );
      setMessage("云端数据备份已开始下载。API Key 不会包含在备份中。");
    });
  };
  const handleRecycleAction = async (
    item: RecycleBinItem,
    action: "restore" | "delete",
  ) => {
    if (localPreview) {
      setMessage("本地预览模式不会修改云端回收站。");
      return;
    }
    if (
      busy ||
      (action === "delete" &&
        !window.confirm(`永久删除《${item.name}》？此操作不可恢复。`))
    )
      return;
    await runBusy(async () => {
      const response = await fetch("/api/account/recycle-bin/", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: item.bookId, action }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "回收站操作失败。");
      await loadRecycleBin();
      setCloudData(await getUserDataSummary());
      setMessage(
        action === "restore"
          ? `《${item.name}》已恢复到云端书架。`
          : `《${item.name}》已永久删除。`,
      );
    });
  };
  const handleDeleteQuote = async (quote: CloudQuote, index: number) => {
    if (quote.isPreset) {
      setMessage("系统金句不可删除。");
      return;
    }
    if (busy || !window.confirm("删除这条金句？")) return;
    await runBusy(async () => {
      const nextQuotes = quotes.filter((_, quoteIndex) => quoteIndex !== index);
      await persistQuotes(
        nextQuotes,
        `已删除“${quote.text.slice(0, 24)}${quote.text.length > 24 ? "…" : ""}”。`,
      );
    });
  };

  const persistQuotes = async (
    nextQuotes: CloudQuote[],
    successMessage: string,
  ): Promise<void> => {
    if (localPreview) {
      setQuotes(nextQuotes);
      setCloudData((current) =>
        current ? { ...current, quotes: nextQuotes.length } : current,
      );
      setMessage(successMessage);
      return;
    }
    if (!cloudSettings) throw new Error("云端设置尚未加载，请刷新后重试。");
    const response = await fetch("/api/account/data/", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: { ...cloudSettings, quotes: nextQuotes, apiKey: "" },
      }),
    });
    if (!response.ok) throw new Error("金句保存失败，请稍后重试。");
    setQuotes(nextQuotes);
    setCloudSettings({ ...cloudSettings, quotes: nextQuotes });
    setCloudData((current) =>
      current ? { ...current, quotes: nextQuotes.length } : current,
    );
    setMessage(successMessage);
  };

  const handleAddQuote = async () => {
    const text = newQuoteText.trim();
    if (!text || busy) return;
    await runBusy(async () => {
      await persistQuotes(
        [{ text, author: newQuoteAuthor.trim() || "用户摘录" }, ...quotes],
        "金句已添加到顶部。",
      );
      setNewQuoteText("");
      setNewQuoteAuthor("");
    });
  };

  const startQuoteEdit = (index: number) => {
    const quote = quotes[index];
    if (!quote || quote.isPreset) return;
    setEditingQuoteIndex(index);
    setQuoteDraftText(quote.text);
    setQuoteDraftAuthor(quote.author);
  };

  const cancelQuoteEdit = () => {
    setEditingQuoteIndex(null);
    setQuoteDraftText("");
    setQuoteDraftAuthor("");
  };

  const handleSaveQuoteEdit = async () => {
    if (editingQuoteIndex === null || !quoteDraftText.trim() || busy) return;
    await runBusy(async () => {
      const nextQuotes = quotes.map((quote, index) =>
        index === editingQuoteIndex
          ? {
              ...quote,
              text: quoteDraftText.trim(),
              author: quoteDraftAuthor.trim() || "用户摘录",
            }
          : quote,
      );
      await persistQuotes(nextQuotes, "金句已更新。");
      cancelQuoteEdit();
    });
  };
  const handleDeleteAssistantSession = async (
    session: CloudAssistantSession,
  ) => {
    if (localPreview) {
      setMessage("本地预览模式不会修改云端会话。");
      return;
    }
    if (busy || !window.confirm(`删除会话“${session.title}”？`)) return;
    await runBusy(async () => {
      await deleteAssistantSession(session.sessionId);
      setAssistantSessions((current) =>
        current.filter((item) => item.sessionId !== session.sessionId),
      );
      setMessage("费曼小助手会话已删除。");
    });
  };
  const handleDeleteAssistantMemory = async (memory: AssistantMemory) => {
    if (localPreview) {
      setMessage("本地预览模式不会修改云端记忆。");
      return;
    }
    if (busy || !window.confirm("删除这条长期记忆？")) return;
    await runBusy(async () => {
      await deleteAssistantMemory(memory.id);
      setAssistantMemories((current) =>
        current.filter((item) => item.id !== memory.id),
      );
      setCloudData((current) =>
        current
          ? {
              ...current,
              assistantMemories: Math.max(0, current.assistantMemories - 1),
            }
          : current,
      );
      setMessage("长期记忆已删除。");
    });
  };
  const handleClearAssistantMemories = async () => {
    if (localPreview) {
      setAssistantMemories([]);
      setCloudData((current) =>
        current ? { ...current, assistantMemories: 0 } : current,
      );
      setMessage("本地预览已清空长期记忆。");
      return;
    }
    if (
      busy ||
      !assistantMemories.length ||
      !window.confirm("清空全部长期记忆？此操作不可恢复。")
    )
      return;
    await runBusy(async () => {
      await clearAssistantMemories();
      setAssistantMemories([]);
      setCloudData((current) =>
        current ? { ...current, assistantMemories: 0 } : current,
      );
      setMessage("长期记忆已全部清空。");
    });
  };
  const exportAssistantMemories = () => {
    downloadJson(
      { version: 1, exportedAt: Date.now(), memories: assistantMemories },
      `feynman-assistant-memory-${new Date().toISOString().slice(0, 10)}.json`,
    );
    setMessage("长期记忆备份已开始下载。");
  };
  const handleToggleAssistantMemory = async () => {
    const next = !assistantMemoryEnabled;
    if (localPreview || !cloudSettings) {
      setAssistantMemoryEnabled(next);
      setMessage(
        next ? "本地预览已开启长期记忆。" : "本地预览已关闭长期记忆。",
      );
      return;
    }
    await runBusy(async () => {
      const response = await fetch("/api/account/data/", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ...cloudSettings,
            assistantMemoryEnabled: next,
            apiKey: "",
          },
        }),
      });
      if (!response.ok) throw new Error("长期记忆设置保存失败。");
      setAssistantMemoryEnabled(next);
      setCloudSettings({ ...cloudSettings, assistantMemoryEnabled: next });
      setMessage(
        next
          ? "费曼小助手长期记忆已开启。"
          : "费曼小助手长期记忆已关闭，之后不会再保存新的明确记忆。",
      );
    });
  };
  const handleTogglePersonalization = async () => {
    const next = !personalizationEnabled;
    if (localPreview || !cloudSettings) {
      setPersonalizationEnabled(next);
      setMessage(
        next ? "本地预览已开启个性化分析。" : "本地预览已关闭个性化分析。",
      );
      return;
    }
    await runBusy(async () => {
      const response = await fetch("/api/account/data/", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ...cloudSettings,
            personalizationAnalyticsEnabled: next,
            apiKey: "",
          },
        }),
      });
      if (!response.ok) throw new Error("个性化分析设置保存失败。");
      setPersonalizationEnabled(next);
      setCloudSettings({
        ...cloudSettings,
        personalizationAnalyticsEnabled: next,
      });
      setMessage(
        next
          ? "个性化分析已开启。"
          : "个性化分析已关闭，系统将停止记录新的行为分析数据。",
      );
    });
  };
  const handleLogout = async () => {
    if (localPreview) {
      router.push("/");
      return;
    }
    await runBusy(async () => {
      await logout();
      router.push("/login");
    });
  };

  const migrationNow = activityRangeEnd.getTime();
  const migrationAvailable = Boolean(
    !localPreview &&
    localMigration?.hasData &&
    migrationState?.status !== "completed" &&
    (!localMigration.deadlineAt || localMigration.deadlineAt > migrationNow) &&
    (!migrationState?.deadlineAt ||
      Date.parse(migrationState.deadlineAt) > migrationNow),
  );

  const handleCloudMigration = async () => {
    if (!localMigration?.payload || migrationBusy) return;
    setMigrationBusy(true);
    setError(null);
    setMessage(null);
    try {
      await migrateLocalData(localMigration.payload);
      await clearMigratedLocalData();
      setLocalMigration({ ...localMigration, hasData: false, payload: null });
      setMigrationState((current) =>
        current
          ? {
              ...current,
              status: "completed",
              completedAt: new Date().toISOString(),
            }
          : current,
      );
      setCloudData(await getUserDataSummary());
      setCloudBooks((await getCloudBookSummaries()) as CloudBook[]);
      setMessage("本机历史数据已迁移到云端，本机用户数据已清理。");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "历史数据迁移失败，本机数据未删除。",
      );
    } finally {
      setMigrationBusy(false);
    }
  };

  const handleDismissMigration = () => {
    dismissLocalMigrationNotice();
    setLocalMigration(null);
    setMessage("已关闭迁移提醒，本机历史数据仍保留。");
  };

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const visibleBooks = normalizedSearch
    ? cloudBooks.filter((book) =>
        `${book.name} ${book.author || ""}`
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      )
    : cloudBooks;
  const visibleQuotes = normalizedSearch
    ? quotes.filter((quote) =>
        `${quote.text} ${quote.author}`
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      )
    : quotes;
  const visibleAssistantSessions = normalizedSearch
    ? assistantSessions.filter((session) =>
        `${session.title} ${session.bookId || ""}`
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      )
    : assistantSessions;
  const visibleAssistantMemories = normalizedSearch
    ? assistantMemories.filter((memory) =>
        `${memory.content} ${assistantMemoryCategoryLabels[memory.category] || memory.category}`
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      )
    : assistantMemories;

  if (loading)
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4"
        role="status"
      >
        <RefreshCw
          size={17}
          className="mr-2 animate-spin text-[var(--accent)]"
          aria-hidden="true"
        />
        正在读取账号中心
      </main>
    );
  if (!user)
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center bg-[var(--bg-primary)] px-4 py-8">
        <section className="card w-full p-6 text-center">
          <UserRound
            className="mx-auto text-[var(--accent)]"
            size={28}
            aria-hidden="true"
          />
          <h1 className="mt-3 text-xl font-bold">请先登录账号</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            登录后才能查看云端书架和管理学习数据。
          </p>
          <a
            href={accountLoginHref("/account")}
            className="btn-primary mt-5 inline-flex min-h-11 items-center gap-2"
          >
            <ExternalLink size={16} aria-hidden="true" />
            前往登录
          </a>
        </section>
      </main>
    );

  const renderPanel = () => {
    if (activeTab === "overview")
      return (
        <Panel
          title="概览"
          icon={LayoutDashboard}
          hint={
            localPreview
              ? "本地预览"
              : user.hasPassword
                ? "本地账号"
                : "观猹账号"
          }
        >
          <div className="space-y-3">
            <section
              className="card border-l-4 border-l-[var(--accent)] p-4"
              aria-labelledby="account-profile-title"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3
                    id="account-profile-title"
                    className="text-sm font-semibold"
                  >
                    账号资料
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    账号名称和头像会在费曼读书助手内展示。
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--accent)]">
                  <Cloud size={14} aria-hidden="true" />
                  云端已启用
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => profileAvatarInputRef.current?.click()}
                  className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent)]/10 text-xl font-semibold text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  aria-label="上传头像"
                  title="点击更换头像"
                >
                  {profileAvatar ? (
                    <img
                      src={profileAvatar}
                      alt="账号头像"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (profileName || profileUsername || "我").slice(0, 1)
                  )}
                  <input
                    ref={profileAvatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={handleAvatarUpload}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {profileName || profileUsername || "未设置账号名称"}
                  </p>
                  <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                    {user.hasPassword
                      ? "本地账号 · 名称同时用于登录"
                      : "观猹账号 · 云端资料已同步"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (showNameEditor) {
                      cancelNameEdit();
                    } else {
                      if (showPasswordEditor) cancelPasswordEdit();
                      setShowNameEditor(true);
                    }
                  }}
                  aria-expanded={showNameEditor}
                  aria-controls="account-name-editor"
                  className="btn-secondary inline-flex min-h-10 shrink-0 items-center gap-1.5 px-3 text-sm"
                >
                  <Pencil size={15} aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {showNameEditor ? "收起" : "修改账号名称"}
                  </span>
                  <span className="sm:hidden">
                    {showNameEditor ? "收起" : "修改名称"}
                  </span>
                </button>
                {user.hasPassword && (
                  <button
                    type="button"
                    onClick={() => {
                      if (showPasswordEditor) {
                        cancelPasswordEdit();
                      } else {
                        if (showNameEditor) cancelNameEdit();
                        setShowPasswordEditor(true);
                      }
                    }}
                    aria-expanded={showPasswordEditor}
                    aria-controls="account-password-editor"
                    className="btn-secondary inline-flex min-h-10 shrink-0 items-center gap-1.5 px-3 text-sm"
                  >
                    <KeyRound size={15} aria-hidden="true" />
                    <span className="hidden sm:inline">
                      {showPasswordEditor ? "收起" : "修改密码"}
                    </span>
                    <span className="sm:hidden">
                      {showPasswordEditor ? "收起" : "密码"}
                    </span>
                  </button>
                )}
              </div>
              {showNameEditor && (
                <div
                  id="account-name-editor"
                  className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]/35 p-3"
                >
                  <label className="block text-sm font-medium">
                    <span className="mb-1.5 block">账号名称</span>
                    <input
                      value={user.hasPassword ? profileUsername : profileName}
                      onChange={(event) =>
                        user.hasPassword
                          ? (setProfileUsername(event.target.value),
                            setProfileName(event.target.value))
                          : setProfileName(event.target.value)
                      }
                      maxLength={user.hasPassword ? 32 : 40}
                      className="input-field min-h-11 w-full text-sm"
                      placeholder={
                        user.hasPassword
                          ? "用于登录和页面展示"
                          : "在费曼读书助手内展示"
                      }
                      aria-label="账号名称"
                    />
                    <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">
                      {user.hasPassword
                        ? "用于下次登录，也会同步作为页面展示名称。"
                        : "用于页面展示，不影响观猹登录方式。"}
                    </span>
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveProfile()}
                      disabled={busy || localPreview}
                      className="btn-primary min-h-10 px-4 text-sm"
                    >
                      保存账号资料
                    </button>
                    <button
                      type="button"
                      onClick={cancelNameEdit}
                      disabled={busy}
                      className="btn-secondary min-h-10 px-4 text-sm"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
              {user.hasPassword && showPasswordEditor && (
                <div
                  id="account-password-editor"
                  className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]/35 p-3"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block text-sm font-medium">
                      <span className="mb-1.5 block">当前密码</span>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(event) =>
                          setCurrentPassword(event.target.value)
                        }
                        autoComplete="current-password"
                        className="input-field min-h-11 w-full text-sm"
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      <span className="mb-1.5 block">新密码</span>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        autoComplete="new-password"
                        placeholder="至少 8 个字符"
                        className="input-field min-h-11 w-full text-sm"
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      <span className="mb-1.5 block">确认新密码</span>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        autoComplete="new-password"
                        className="input-field min-h-11 w-full text-sm"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleChangePassword()}
                      disabled={
                        busy ||
                        !currentPassword ||
                        !newPassword ||
                        !confirmPassword
                      }
                      className="btn-primary min-h-10 px-4 text-sm"
                    >
                      更新密码
                    </button>
                    <button
                      type="button"
                      onClick={cancelPasswordEdit}
                      disabled={busy}
                      className="btn-secondary min-h-10 px-4 text-sm"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </section>
            {watchaEnabled && user.tokendanceSubject && !user.passwordAccountMergedAt && (
              <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]/35 p-4" aria-labelledby="password-account-migration-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id="password-account-migration-title" className="text-sm font-semibold">迁移备案期间账号</h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">将原账号的书籍、记录、金句、小助手数据和 API 配置合并到当前观猹账号。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => showAccountMigration ? cancelAccountMigration() : setShowAccountMigration(true)}
                    aria-expanded={showAccountMigration}
                    aria-controls="password-account-migration-form"
                    className="btn-secondary min-h-10 shrink-0 px-3 text-sm"
                  >
                    {showAccountMigration ? "收起" : "开始迁移"}
                  </button>
                </div>
                {showAccountMigration && (
                  <div id="password-account-migration-form" className="mt-3 border-t border-[var(--border)] pt-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm font-medium">
                        <span className="mb-1.5 block">原账号名称</span>
                        <input value={migrationUsername} onChange={event => setMigrationUsername(event.target.value)} autoComplete="username" className="input-field min-h-11 w-full text-sm" />
                      </label>
                      <label className="block text-sm font-medium">
                        <span className="mb-1.5 block">原账号密码</span>
                        <input type="password" value={migrationPassword} onChange={event => setMigrationPassword(event.target.value)} autoComplete="current-password" className="input-field min-h-11 w-full text-sm" />
                      </label>
                    </div>
                    <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]">
                      <input type="checkbox" checked={migrationConfirmed} onChange={event => setMigrationConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                      <span>我已确认：同一条记录保留修改时间较新的版本；迁移成功后原账号和原密码将永久停用，之后只使用观猹登录。</span>
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void handleAccountMigration()} disabled={busy || !migrationUsername.trim() || !migrationPassword || !migrationConfirmed} className="btn-primary min-h-10 px-4 text-sm">确认合并账号</button>
                      <button type="button" onClick={cancelAccountMigration} disabled={busy} className="btn-secondary min-h-10 px-4 text-sm">取消</button>
                    </div>
                  </div>
                )}
              </section>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["books", cloudData?.books ?? 0, "本书"],
                ["notes", cloudData?.notes ?? 0, "条笔记"],
                [
                  "practice",
                  (cloudData?.practices ?? 0) + (cloudData?.qaRecords ?? 0),
                  "次练习",
                ],
                ["ai", cloudData?.aiUsageRecords ?? 0, "次 AI 使用"],
              ].map(([, value, label]) => (
                <div
                  key={label}
                  className="flex min-h-[76px] flex-col items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]/50 p-3 text-center"
                >
                  <strong className="block text-xl tabular-nums">
                    {value}
                  </strong>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {label}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-xs text-[var(--text-secondary)]">
              <span>书单 {cloudData?.lists ?? 0}</span>
              <span>书籍关系 {cloudData?.relations ?? 0}</span>
              <span>最近同步 {formatDate(cloudData?.lastSyncAt ?? null)}</span>
            </div>
            <ActivityCalendar
              endDate={activityRangeEnd}
              days={activityDays}
              loading={activityLoading}
            />
            <div className="card flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">个性化分析</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  用于让费曼小助手更了解你的阅读习惯，可随时关闭。
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={personalizationEnabled}
                onClick={() => void handleTogglePersonalization()}
                disabled={busy}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${personalizationEnabled ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
                aria-label="切换个性化分析"
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${personalizationEnabled ? "left-6" : "left-1"}`}
                />
              </button>
            </div>
          </div>
        </Panel>
      );
    if (activeTab === "bookshelf")
      return (
        <Panel
          title="我的云端书架"
          icon={Archive}
          hint={`${visibleBooks.length}/${cloudBooks.length} 本书`}
        >
          <SearchBox
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="搜索书名或作者"
          />
          <div className="card p-4">
            {visibleBooks.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
                <Archive
                  className="mx-auto mb-2 opacity-50"
                  size={24}
                  aria-hidden="true"
                />
                {cloudBooks.length === 0
                  ? "云端书架还没有用户书籍。"
                  : "没有匹配的书籍。"}
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {visibleBooks.map((book) => {
                  const progress = bookProgress(book);
                  const questionLabel =
                    progress.questionsTotal > 0
                      ? `问答 ${progress.questionsDone}/${progress.questionsTotal}`
                      : "问答未开始";
                  return (
                    <li key={book.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{book.name}</p>
                          <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                            {book.author || "作者未知"} ·{" "}
                            {book.status === "finished"
                              ? "已完成"
                              : book.status === "reading"
                                ? "学习中"
                                : "未开始"}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                          {formatDate(new Date(book.updatedAt).toISOString())}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                        <span className="rounded border border-[var(--accent)]/25 bg-[var(--accent)]/7 px-2 py-1 text-[var(--accent)]">
                          阶段 {book.currentPhase}/6
                        </span>
                        <span className="rounded border border-[var(--border)] bg-[var(--bg-secondary)]/55 px-2 py-1">
                          实践 {progress.practice} 次
                        </span>
                        <span className="rounded border border-[var(--border)] bg-[var(--bg-secondary)]/55 px-2 py-1">
                          {questionLabel}
                        </span>
                        <span className="rounded border border-[var(--border)] bg-[var(--bg-secondary)]/55 px-2 py-1">
                          笔记 {progress.notes} 条
                        </span>
                        <span
                          className={`rounded border px-2 py-1 ${progress.recommendations ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700" : "border-[var(--border)] bg-[var(--bg-secondary)]/55"}`}
                        >
                          {progress.recommendations
                            ? "相关推荐已生成"
                            : "相关推荐未生成"}
                        </span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-all"
                          style={{
                            width: `${Math.min(100, Math.max(0, (book.currentPhase / 6) * 100))}%`,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>
      );
    if (activeTab === "quotes")
      return (
        <Panel
          title="金句管理"
          icon={Cloud}
          hint={`${visibleQuotes.length}/${quotes.length} 条金句`}
        >
          <div className="space-y-3">
            <div className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">新增金句</p>
                <span className="text-xs text-[var(--text-secondary)]">
                  保存到当前账号
                </span>
              </div>
              <textarea
                value={newQuoteText}
                onChange={(event) => setNewQuoteText(event.target.value)}
                className="input-field mt-3 min-h-20 w-full resize-y text-sm"
                placeholder="输入金句内容"
                aria-label="输入金句内容"
              />
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  value={newQuoteAuthor}
                  onChange={(event) => setNewQuoteAuthor(event.target.value)}
                  className="input-field min-h-10 flex-1 text-sm"
                  placeholder="作者（选填）"
                  aria-label="作者（选填）"
                />
                <button
                  type="button"
                  onClick={() => void handleAddQuote()}
                  disabled={!newQuoteText.trim() || busy}
                  className="btn-primary inline-flex min-h-10 items-center justify-center gap-1.5 px-4 text-sm"
                >
                  <Plus size={15} aria-hidden="true" />
                  添加
                </button>
              </div>
            </div>
            <SearchBox
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="搜索金句内容或作者"
            />
            <div className="card p-4">
              {visibleQuotes.length === 0 ? (
                <div className="py-10 text-center text-sm text-[var(--text-secondary)]">
                  <Cloud
                    className="mx-auto mb-2 opacity-50"
                    size={24}
                    aria-hidden="true"
                  />
                  {quotes.length === 0
                    ? "还没有云端金句。"
                    : "没有匹配的金句。"}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {visibleQuotes.map((quote) => {
                    const index = quotes.indexOf(quote);
                    const editing = editingQuoteIndex === index;
                    return (
                      <li
                        key={`${quote.text}-${index}`}
                        className="py-3 first:pt-0 last:pb-0"
                      >
                        {editing ? (
                          <div className="space-y-2">
                            <textarea
                              value={quoteDraftText}
                              onChange={(event) =>
                                setQuoteDraftText(event.target.value)
                              }
                              className="input-field min-h-20 w-full resize-y text-sm"
                              aria-label="编辑金句内容"
                            />
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <input
                                value={quoteDraftAuthor}
                                onChange={(event) =>
                                  setQuoteDraftAuthor(event.target.value)
                                }
                                className="input-field min-h-10 flex-1 text-sm"
                                placeholder="作者（选填）"
                                aria-label="编辑金句作者"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSaveQuoteEdit()}
                                disabled={!quoteDraftText.trim() || busy}
                                className="btn-primary inline-flex min-h-10 items-center justify-center gap-1.5 px-3 text-sm"
                              >
                                <Check size={15} aria-hidden="true" />
                                保存
                              </button>
                              <button
                                type="button"
                                onClick={cancelQuoteEdit}
                                disabled={busy}
                                className="btn-secondary min-h-10 px-3 text-sm"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="leading-6">“{quote.text}”</p>
                              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                {quote.author}
                                {quote.isPreset ? " · 系统金句" : ""}
                              </p>
                            </div>
                            {!quote.isPreset && (
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  onClick={() => startQuoteEdit(index)}
                                  disabled={busy}
                                  className="icon-button h-9 w-9 text-[var(--accent)]"
                                  aria-label="编辑金句"
                                  title="编辑金句"
                                >
                                  <Pencil size={15} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDeleteQuote(quote, index)
                                  }
                                  disabled={busy}
                                  className="icon-button h-9 w-9 text-red-600"
                                  aria-label="删除金句"
                                  title="删除金句"
                                >
                                  <Trash2 size={15} aria-hidden="true" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </Panel>
      );
    if (activeTab === "assistant")
      return (
        <Panel
          title="费曼小助手"
          icon={UserRound}
          hint={`${visibleAssistantSessions.length}/${assistantSessions.length} 个会话`}
        >
          <SearchBox
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="搜索会话或长期记忆"
          />
          <div className="space-y-3">
            <div className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">会话记录</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    仅显示当前观猹账号的小助手会话。
                  </p>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  {visibleAssistantSessions.length}/{assistantSessions.length}{" "}
                  个会话
                </span>
              </div>
              {visibleAssistantSessions.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--text-secondary)]">
                  <UserRound
                    className="mx-auto mb-2 opacity-50"
                    size={24}
                    aria-hidden="true"
                  />
                  {assistantSessions.length === 0
                    ? "还没有云端会话"
                    : "没有匹配的会话。"}
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--border)]">
                  {visibleAssistantSessions.map((session) => (
                    <li
                      key={session.sessionId}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{session.title}</p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {Array.isArray(session.data?.messages)
                            ? `${session.data.messages.length} 条消息`
                            : "暂无消息"}{" "}
                          · 更新于 {formatDate(session.updatedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void handleDeleteAssistantSession(session)
                        }
                        disabled={busy}
                        className="btn-secondary min-h-10 shrink-0 px-3 text-sm text-red-600"
                      >
                        删除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">长期记忆</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    只保存你明确要求费曼小助手记住的偏好，并按当前账号隔离。关闭后不会删除已有记忆。
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={assistantMemoryEnabled}
                  onClick={() => void handleToggleAssistantMemory()}
                  disabled={busy}
                  aria-label="切换费曼小助手长期记忆"
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${assistantMemoryEnabled ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${assistantMemoryEnabled ? "left-6" : "left-1"}`}
                  />
                </button>
              </div>
              {assistantMemoryError && (
                <p
                  className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800"
                  role="alert"
                >
                  {assistantMemoryError}
                </p>
              )}
              {!assistantMemoryError &&
                (visibleAssistantMemories.length === 0 ? (
                  <div className="mt-4 rounded-md border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--text-secondary)]">
                    {assistantMemories.length === 0
                      ? "还没有保存的长期记忆。对费曼小助手说“请记住……”即可添加。"
                      : "没有匹配的长期记忆。"}
                  </div>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {visibleAssistantMemories.map((memory) => (
                      <li
                        key={memory.id}
                        className="flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]/55 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-6">{memory.content}</p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">
                            {assistantMemoryCategoryLabels[memory.category] ||
                              memory.category}{" "}
                            · 更新于{" "}
                            {formatDate(
                              new Date(memory.updatedAt).toISOString(),
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeleteAssistantMemory(memory)
                          }
                          disabled={busy}
                          className="icon-button h-9 w-9 shrink-0 text-red-600"
                          aria-label="删除长期记忆"
                          title="删除长期记忆"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                <button
                  type="button"
                  onClick={exportAssistantMemories}
                  disabled={!assistantMemories.length}
                  className="btn-secondary inline-flex min-h-10 items-center gap-1.5 text-sm disabled:opacity-50"
                >
                  <FileDown size={15} aria-hidden="true" />
                  导出记忆
                </button>
                <button
                  type="button"
                  onClick={() => void handleClearAssistantMemories()}
                  disabled={!assistantMemories.length || busy}
                  className="btn-secondary inline-flex min-h-10 items-center gap-1.5 text-sm text-red-600 disabled:opacity-50"
                >
                  <Trash2 size={15} aria-hidden="true" />
                  清空全部
                </button>
              </div>
            </div>
          </div>
        </Panel>
      );
    if (activeTab === "recycle")
      return (
        <Panel title="回收站" icon={Trash2} hint="删除后 7 天内可恢复">
          <div className="card p-4">
            {recycleItems.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
                <Trash2
                  className="mx-auto mb-2 opacity-50"
                  size={24}
                  aria-hidden="true"
                />
                回收站是空的
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {recycleItems.map((item) => (
                  <li
                    key={item.bookId}
                    className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {item.author || "作者未知"} · 移入回收站于{" "}
                        {formatDate(item.deletedAt)} · 可恢复至{" "}
                        {formatDate(item.restoreUntil)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void handleRecycleAction(item, "restore")
                        }
                        disabled={busy}
                        className="btn-secondary inline-flex min-h-10 items-center gap-1.5 text-sm"
                      >
                        <RotateCcw size={15} aria-hidden="true" />
                        恢复
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRecycleAction(item, "delete")}
                        disabled={busy}
                        className="btn-secondary inline-flex min-h-10 items-center gap-1.5 text-sm text-red-600"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        永久删除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      );
    if (activeTab === "data")
      return (
        <Panel title="数据管理" icon={Download} hint="云端内容统计与备份">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [cloudData?.books ?? 0, "本书"],
                [cloudData?.notes ?? 0, "条笔记"],
                [cloudData?.practices ?? 0, "次实践"],
                [cloudData?.qaRecords ?? 0, "条问答"],
                [cloudData?.quotes ?? quotes.length, "条金句"],
                [
                  cloudData?.assistantSessions ?? assistantSessions.length,
                  "个会话",
                ],
                [cloudData?.assistantMemories ?? 0, "条记忆"],
                [formatBytes(cloudData?.storageBytes ?? 0), "云端容量"],
              ].map(([value, label]) => (
                <div
                  key={String(label)}
                  className="flex min-h-[76px] flex-col items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]/50 p-3 text-center"
                >
                  <strong className="block truncate text-lg tabular-nums sm:text-xl">
                    {value}
                  </strong>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {label}
                  </span>
                </div>
              ))}
            </div>
            <div className="card p-4">
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                云端备份不包含 API Key。导入会按记录 ID
                和更新时间合并，较新的记录优先。IndexedDB
                只在首次登录时用于历史迁移。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCloudExport()}
                  disabled={busy || localPreview}
                  className="btn-primary inline-flex min-h-11 items-center gap-2"
                >
                  <FileDown size={16} aria-hidden="true" />
                  导出云端数据
                </button>
                <label
                  className={`btn-secondary inline-flex min-h-11 cursor-pointer items-center gap-2 ${busy || localPreview ? "pointer-events-none opacity-60" : ""}`}
                >
                  <Upload size={16} aria-hidden="true" />
                  导入云端备份
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="sr-only"
                    onChange={handleImportFile}
                    disabled={busy || localPreview}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-secondary)]">
                <span>书单 {cloudData?.lists ?? 0}</span>
                <span>书籍关系 {cloudData?.relations ?? 0}</span>
                <span>AI 使用 {cloudData?.aiUsageRecords ?? 0}</span>
                <span>
                  最近同步 {formatDate(cloudData?.lastSyncAt ?? null)}
                </span>
              </div>
            </div>
            {migrationAvailable && (
              <div className="card border-l-4 border-l-[var(--accent)] p-4">
                <p className="text-sm font-medium">检测到本机历史数据</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  共 {localMigration?.books || 0} 本书、
                  {localMigration?.assistantSessions || 0} 个助手会话和{" "}
                  {localMigration?.assistantMemories || 0}{" "}
                  条长期记忆。导入成功后，本机用户数据会清理，系统示例书不会上传。
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCloudMigration()}
                    disabled={migrationBusy}
                    className="btn-primary min-h-10 px-3 text-sm"
                  >
                    {migrationBusy ? "正在迁移…" : "导入本机历史数据"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissMigration}
                    disabled={migrationBusy}
                    className="btn-secondary min-h-10 px-3 text-sm"
                  >
                    不再提醒
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                  点击“不再提醒”不会删除本机数据。
                </p>
              </div>
            )}
          </div>
        </Panel>
      );
    return null;
  };

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto flex h-[calc(100vh-8rem)] min-h-[480px] max-w-6xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-glass-strong)] shadow-[var(--brand-shadow)]">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="inline-flex min-h-10 items-center gap-2 text-sm text-[var(--accent)]"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span className="hidden sm:inline">返回费曼读书助手</span>
              <span className="sm:hidden">返回</span>
            </Link>
            <span className="h-5 w-px bg-[var(--border)]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">账号中心</p>
              <p className="truncate text-xs text-[var(--text-secondary)]">
                {user.email ||
                  user.phone ||
                  (localPreview ? "本地预览账号" : "观猹账号")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={busy}
            className="btn-secondary inline-flex min-h-10 items-center gap-2"
          >
            <LogOut size={16} aria-hidden="true" />
            {localPreview ? "退出预览" : "退出登录"}
          </button>
        </header>
        {localPreview && (
          <div
            className="mx-4 mt-3 shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 sm:mx-5"
            role="status"
          >
            本地调试预览模式：未连接观猹账号，云端数据读写已暂停。
          </div>
        )}
        {(message || error) && (
          <div
            className={`mx-4 mt-3 shrink-0 rounded-md border px-3 py-2 text-sm sm:mx-5 ${error ? "border-red-500/30 bg-red-500/10 text-red-700" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"}`}
            role={error ? "alert" : "status"}
          >
            {error || message}
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[190px_minmax(0,1fr)]">
          <nav
            className="shrink-0 border-b border-[var(--border)] p-3 md:border-b-0 md:border-r md:p-4"
            aria-label="账号中心分区"
            role="tablist"
          >
            <div className="flex gap-2 overflow-x-auto md:flex-col">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  onClick={() => {
                    setActiveTab(id);
                    setSearchQuery("");
                    setMessage(null);
                    setError(null);
                  }}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition md:w-full ${activeTab === id ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"}`}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </nav>
          <section
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 sm:p-5"
            role="tabpanel"
            aria-label={tabs.find((tab) => tab.id === activeTab)?.label}
          >
            {renderPanel()}
          </section>
        </div>
        <footer className="shrink-0 border-t border-[var(--border)] px-4 py-2 text-center text-xs text-[var(--text-secondary)] sm:text-left">
          账号数据仅对当前登录账号可见 ·{" "}
          <Link
            href="/privacy"
            className="text-[var(--accent)] hover:underline"
          >
            隐私说明
          </Link>
        </footer>
      </div>
    </main>
  );
}
