import { HashRouter, Routes, Route } from 'react-router';
import { ProjectPicker } from '@renderer/pages/ProjectPicker';
import { ChatPage } from '@renderer/pages/ChatPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ProjectPicker />} />
        <Route path="/chat" element={<ChatPage />} />
      </Routes>
    </HashRouter>
  );
}
