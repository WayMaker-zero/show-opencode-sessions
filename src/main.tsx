import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeLangProvider } from './lib/theme-lang'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeLangProvider>
      <App />
    </ThemeLangProvider>
  </React.StrictMode>,
)
