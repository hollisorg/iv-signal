import { createRoot } from 'react-dom/client'
import './styles.css'
import './signal.css'
import App from './App'
import ChatWindow from './components/ChatWindow'

// Keep the reused font notices in the packaged renderer alongside their font files.
for (const href of [
  new URL('./assets/licenses/Barlow-Condensed-OFL.txt', import.meta.url).href,
  new URL('./assets/licenses/DM-Sans-OFL.txt', import.meta.url).href,
  new URL('./assets/licenses/JetBrains-Mono-OFL.txt', import.meta.url).href,
]) {
  const notice = document.createElement('link')
  notice.rel = 'license'
  notice.href = href
  document.head.appendChild(notice)
}

// a Mac draws its window buttons (the traffic lights) at the left of the title bar and nothing at the right
if (/Mac/i.test(navigator.platform)) document.documentElement.classList.add('mac')

createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).has('chatWindow') ? <ChatWindow /> : <App />)
