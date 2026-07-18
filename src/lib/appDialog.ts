export type AppDialogKind = 'alert' | 'confirm' | 'prompt'
export type AppDialogTone = 'danger' | 'warning' | 'info' | 'success'
export type AppDialogResult = boolean | string | null | undefined

export interface AppDialogOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  tone?: AppDialogTone
  defaultValue?: string
  inputLabel?: string
  inputPlaceholder?: string
}

export interface AppDialogRequest extends AppDialogOptions {
  id: number
  kind: AppDialogKind
  resolve: (result: AppDialogResult) => void
}

type DialogListener = (request: AppDialogRequest) => void

let listener: DialogListener | null = null
let nextDialogId = 1

export function subscribeToAppDialogs(nextListener: DialogListener): () => void {
  listener = nextListener
  return () => {
    if (listener === nextListener) listener = null
  }
}

function requestDialog(
  kind: AppDialogKind,
  options: AppDialogOptions,
  fallback: AppDialogResult
): Promise<AppDialogResult> {
  return new Promise(resolve => {
    if (!listener) {
      resolve(fallback)
      return
    }

    listener({
      ...options,
      id: nextDialogId++,
      kind,
      resolve
    })
  })
}

export async function showAppAlert(options: AppDialogOptions): Promise<void> {
  await requestDialog('alert', options, undefined)
}

export async function showAppConfirm(options: AppDialogOptions): Promise<boolean> {
  return (await requestDialog('confirm', options, false)) === true
}

export async function showAppPrompt(options: AppDialogOptions): Promise<string | null> {
  const result = await requestDialog('prompt', options, null)
  return typeof result === 'string' ? result : null
}
