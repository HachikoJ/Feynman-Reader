/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const deleteBookListMock = jest.fn()
const flushPendingStoreWritesMock = jest.fn(() => Promise.resolve())

jest.mock('@/lib/store', () => ({
  addBookRelation: jest.fn(),
  createBookList: jest.fn(),
  deleteBookList: (...args: unknown[]) => deleteBookListMock(...args),
  deleteBookRelation: jest.fn(),
  flushPendingStoreWrites: () => flushPendingStoreWritesMock(),
  getBookLists: jest.fn(() => [{
    id: 'list-1',
    name: '验证书单',
    description: '测试自定义确认框',
    bookIds: [],
    createdAt: 1,
    updatedAt: 1
  }]),
  getBookRelations: jest.fn(() => []),
  getBooks: jest.fn(() => []),
  reloadBookOrganizationFromPersistence: jest.fn(() => Promise.resolve({ lists: [], relations: [] })),
  setBookListMembership: jest.fn(),
  updateBookList: jest.fn()
}))

import AppDialogHost from '../AppDialogHost'
import BookListManager from '../BookListManager'

describe('BookListManager dialogs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses the in-app confirmation dialog before deleting a list', async () => {
    render(
      <>
        <BookListManager lang="zh" />
        <AppDialogHost lang="zh" />
      </>
    )

    fireEvent.click(screen.getByTitle('删除书单'))

    expect(screen.getByRole('heading', { name: '确认删除书单' })).toBeInTheDocument()
    expect(screen.getByText('确定删除书单“验证书单”吗？书籍本身及其学习记录不会被删除。')).toBeInTheDocument()
    expect(deleteBookListMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(deleteBookListMock).toHaveBeenCalledWith('list-1'))
  })
})
