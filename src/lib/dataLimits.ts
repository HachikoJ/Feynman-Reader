export const MAX_DOCUMENT_FILE_SIZE = 20 * 1024 * 1024
export const MAX_DOCUMENT_PAGES = 1000
export const MAX_DOCUMENT_TEXT_LENGTH = 1_000_000
// 单个备份文件的导入安全边界；超出后由导出器自动拆分为多个分卷。
export const MAX_BACKUP_FILE_BYTES = 100 * 1024 * 1024
export const MAX_BACKUP_PART_PAYLOAD_BYTES = 48 * 1024 * 1024
export const MAX_BACKUP_PARTS = 1000
export const MAX_BOOK_TAGS = 20
export const MAX_TAG_LENGTH = 50
export const MAX_AI_ANSWER_LENGTH = 20_000
export const MAX_NOTE_LENGTH = 200_000
export const MAX_BOOK_LISTS = 200
export const MAX_BOOKS_PER_LIST = 1_000
export const MAX_BOOK_RELATIONS = 5_000
export const MAX_BOOK_LIST_NAME_LENGTH = 100
export const MAX_BOOK_LIST_DESCRIPTION_LENGTH = 500
export const MAX_BOOK_RELATION_NOTE_LENGTH = 500
