import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  BookMarked,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Building2,
  Camera,
  ChartNoAxesCombined,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleHelp,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Flame,
  FolderOpen,
  GraduationCap,
  Handshake,
  Info,
  KeyRound,
  Landmark,
  Library,
  Lightbulb,
  Lock,
  MapPinned,
  MessageCircle,
  Microscope,
  Minus,
  NotebookPen,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Rocket,
  Route,
  Scale,
  ScanSearch,
  Search,
  Settings,
  Sparkles,
  Sprout,
  Tag,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  X,
  type LucideIcon
} from 'lucide-react'

export type AppIconName =
  | 'alert' | 'arrowLeft' | 'arrowRight' | 'arrowUp' | 'barChart' | 'bookMarked' | 'bookOpen'
  | 'brain' | 'briefcase' | 'building' | 'camera' | 'chart' | 'check' | 'success'
  | 'chevronDown' | 'chevronLeft' | 'chevronRight' | 'chevronUp' | 'circle' | 'help'
  | 'clipboard' | 'download' | 'eye' | 'file' | 'flame' | 'folder' | 'graduation'
  | 'handshake' | 'info' | 'key' | 'landmark' | 'library' | 'lightbulb' | 'lock'
  | 'map' | 'message' | 'microscope' | 'minus' | 'note' | 'edit' | 'pin' | 'refresh'
  | 'plus' | 'rocket' | 'route' | 'scale' | 'scan' | 'search' | 'settings' | 'sparkles' | 'sprout' | 'tag'
  | 'target' | 'trash' | 'trendDown' | 'trendUp' | 'upload' | 'user' | 'users' | 'close'

export type AppIconTone = 'inherit' | 'accent' | 'blue' | 'cyan' | 'green' | 'amber' | 'red' | 'violet' | 'muted'

const icons: Record<AppIconName, LucideIcon> = {
  alert: AlertTriangle,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  barChart: BarChart3,
  bookMarked: BookMarked,
  bookOpen: BookOpen,
  brain: Brain,
  briefcase: BriefcaseBusiness,
  building: Building2,
  camera: Camera,
  chart: ChartNoAxesCombined,
  check: Check,
  success: CheckCircle2,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  circle: Circle,
  help: CircleHelp,
  clipboard: ClipboardList,
  download: Download,
  eye: Eye,
  file: FileText,
  flame: Flame,
  folder: FolderOpen,
  graduation: GraduationCap,
  handshake: Handshake,
  info: Info,
  key: KeyRound,
  landmark: Landmark,
  library: Library,
  lightbulb: Lightbulb,
  lock: Lock,
  map: MapPinned,
  message: MessageCircle,
  microscope: Microscope,
  minus: Minus,
  note: NotebookPen,
  edit: Pencil,
  pin: Pin,
  plus: Plus,
  refresh: RefreshCw,
  rocket: Rocket,
  route: Route,
  scale: Scale,
  scan: ScanSearch,
  search: Search,
  settings: Settings,
  sparkles: Sparkles,
  sprout: Sprout,
  tag: Tag,
  target: Target,
  trash: Trash2,
  trendDown: TrendingDown,
  trendUp: TrendingUp,
  upload: Upload,
  user: UserRound,
  users: Users,
  close: X
}

const tones: Record<AppIconTone, string> = {
  inherit: '',
  accent: 'text-[var(--accent)]',
  blue: 'text-[var(--accent)]',
  cyan: 'text-[var(--success)]',
  green: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
  violet: 'text-[var(--accent-secondary)]',
  muted: 'text-[var(--text-secondary)]'
}

interface Props {
  name: AppIconName
  tone?: AppIconTone
  size?: number
  strokeWidth?: number
  className?: string
}

export default function AppIcon({ name, tone = 'inherit', size = 20, strokeWidth = 2, className = '' }: Props) {
  const Icon = icons[name]
  return <Icon size={size} strokeWidth={strokeWidth} className={`shrink-0 ${tones[tone]} ${className}`} aria-hidden="true" />
}
