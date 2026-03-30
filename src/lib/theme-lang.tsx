import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'dark' | 'light'
type Language = 'zh' | 'en'

interface ThemeLangContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  lang: Language
  setLang: (lang: Language) => void
}

const ThemeLangContext = createContext<ThemeLangContextType | undefined>(undefined)

export function ThemeLangProvider({ children }: { children: ReactNode }) {
  // 默认夜间模式, 默认中文
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('opencode-theme') as Theme
    return saved || 'dark'
  })
  
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('opencode-lang') as Language
    return saved || 'zh'
  })

  useEffect(() => {
    const html = document.documentElement
    if (theme === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
    localStorage.setItem('opencode-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('opencode-lang', lang)
  }, [lang])

  return (
    <ThemeLangContext.Provider value={{ theme, setTheme: setThemeState, lang, setLang: setLangState }}>
      {children}
    </ThemeLangContext.Provider>
  )
}

export function useThemeLang() {
  const context = useContext(ThemeLangContext)
  if (!context) throw new Error('useThemeLang must be used within ThemeLangProvider')
  return context
}

export const t = {
  zh: {
    searchPlaceholder: '搜索标题或正文',
    copyCommand: '复制命令',
    copied: '已复制',
    recentSessions: '最近会话',
    updating: '更新中',
    found: '找到',
    items: '条',
    noSessionFound: '没有找到对应会话',
    unnamedSession: '未命名会话',
    noPreview: '没有可展示的正文预览',
    loadMore: '继续下滑加载更多',
    messagesCount: '条消息',
    selectSession: '选择左侧会话查看内容',
    readError: '读取历史失败。',
    readDetailError: '读取会话详情失败。',
    copyError: '复制失败，请检查剪贴板权限。',
    bootError: '无法读取本机 opencode 目录。',
    scrollToTop: '回到顶部',
    prevPrompt: '上一个提示词',
    nextPrompt: '下一个提示词',
    importSession: '导入会话',
    exportSession: '导出会话',
    importedTag: '导入会话',
    importedReadonly: '导入会话仅支持查看，不提供恢复命令。'
  },
  en: {
    searchPlaceholder: 'Search title or content',
    copyCommand: 'Copy Command',
    copied: 'Copied',
    recentSessions: 'Recent Sessions',
    updating: 'Updating',
    found: 'Found',
    items: 'items',
    noSessionFound: 'No matching sessions found',
    unnamedSession: 'Unnamed Session',
    noPreview: 'No preview available',
    loadMore: 'Scroll down to load more',
    messagesCount: 'messages',
    selectSession: 'Select a session to view contents',
    readError: 'Failed to read history.',
    readDetailError: 'Failed to read session details.',
    copyError: 'Failed to copy, check clipboard permissions.',
    bootError: 'Failed to read local opencode directory.',
    scrollToTop: 'Scroll to Top',
    prevPrompt: 'Prev Prompt',
    nextPrompt: 'Next Prompt',
    importSession: 'Import Session',
    exportSession: 'Export Session',
    importedTag: 'Imported',
    importedReadonly: 'Imported sessions are view-only and have no restore command.'
  }
}
