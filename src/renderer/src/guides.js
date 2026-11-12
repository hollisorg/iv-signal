// Stable, named places shared by the visual guide and the agent. No arbitrary selectors from agents.
export const PLACES = {
  brand_switch: { page: 'today', selector: '[data-guide="workspace"]', title: 'Your brand', text: 'Choose which brand you\'re working on. Each brand has its own Brand Brain, posts, calendar and library.' },
  today: { page: 'today', selector: '.signal-ask', title: 'Start with an idea', text: 'Say what you want to post about in plain words. Your own Claude Code, Codex or Hermes drafts it in your brand\'s voice for each network.' },
  to_post: { page: 'today', selector: '[data-guide="to-post"]', fallback: '.tiles', title: 'Ready to post', text: 'Approved posts whose time has come. Copy & open puts the words on your clipboard and opens the network; paste, post, then mark it posted.' },
  brain_profile: { page: 'brand', selector: '[data-guide="brand-profile"]', title: 'The basics', text: 'What you offer, who it\'s for and how you sound. Everything your agent writes starts here.' },
  brain_never: { page: 'brand', selector: '[data-guide="brand-never"]', title: 'Never say', text: 'Claims your brand never makes. A draft that says one can\'t be approved until it\'s fixed.' },
  brain_notes: { page: 'brand', selector: '[data-guide="brand-notes"]', title: 'The Brand Brain', text: 'Facts, voice, rules, lessons and references, one note at a time. Tell the chat something lasting and it saves it here.' },
  create: { page: 'create', selector: '[data-guide="composer"]', title: 'Write once', text: 'Write the idea, pick the networks, and each gets its own version with its own limit. Edit any of them before approving.' },
  checks: { page: 'create', selector: '[data-guide="checks"]', fallback: '[data-guide="composer"]', title: 'Checks before approval', text: 'Each version is checked for the network\'s length limit, the picture or video it needs, and your Never say list.' },
  approve: { page: 'approve', selector: '.page-toolbar', fallback: '.approve .empty', title: 'You have the final say', text: 'Approve exactly what goes out. Change anything afterwards and it needs approving again.' },
  calendar: { page: 'calendar', selector: '[data-guide="calendar"]', title: 'The calendar', text: 'Every planned version by day. Drafts show dashed until they\'re approved.' },
  library: { page: 'library', selector: '[data-guide="library"]', title: 'Your library', text: 'Pictures and videos for your posts. Add a description to each picture so people using screen readers know what\'s in it.' },
  channels: { page: 'channels', selector: '[data-guide="channels"]', title: 'Where you post', text: 'Add each network account. Publishing straight from IV Signal comes later; for now you post approved versions yourself in a click or two.' },
  agent: { page: 'settings', selector: '#setup-agent', title: 'Bring your own agent', text: 'The chat runs on your own Claude Code, Codex or Hermes, on your own plan. IV Signal needs no API key of its own.' },
  connections: { page: 'settings', selector: '#setup-connections', title: 'Use it from your other apps', text: 'Connect IV Signal to Claude Code, Codex or Claude Desktop. They work on the same brands and posts.' },
}
export const GUIDES = {
  today: ['brand_switch', 'today', 'to_post', 'brain_profile', 'create', 'approve', 'calendar', 'channels', 'agent'],
  brand: ['brain_profile', 'brain_never', 'brain_notes'],
  create: ['create', 'checks', 'approve'],
  approve: ['approve', 'checks'],
  calendar: ['calendar', 'to_post'],
  library: ['library'],
  channels: ['channels'],
  settings: ['agent', 'connections'],
}
export const startGuide = (page) => window.dispatchEvent(new CustomEvent('iv:guide', { detail: { steps: GUIDES[page] || GUIDES.today } }))
export const guidePlaces = () => Object.entries(PLACES).map(([id, { page, title, text }]) => ({ id, page, title, about: text }))
