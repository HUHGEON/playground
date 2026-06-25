import { useState } from 'react';

export default function NameOverlay({ onJoin, connected, error }) {
  const [name, setName] = useState('');
  const submit = () => { if (name.trim()) onJoin(name.trim()); };
  return (
    <div id="overlay">
      <div className="box">
        <h2>닉네임 입력</h2>
        <input
          id="nick" maxLength={16} placeholder="닉네임" autoComplete="off" autoFocus
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {error && <div id="joinError" style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center' }}>{error}</div>}
        <button id="joinBtn" onClick={submit} disabled={!connected || !name.trim()}>입장하기</button>
      </div>
    </div>
  );
}
