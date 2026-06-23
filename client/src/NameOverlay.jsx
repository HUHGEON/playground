import { useState } from 'react';

export default function NameOverlay({ onJoin, connected }) {
  const [name, setName] = useState('');
  const submit = (e) => { e.preventDefault(); if (name.trim()) onJoin(name.trim()); };
  return (
    <div className="overlay">
      <form className="overlay-box" onSubmit={submit}>
        <h1 className="brand">play<span className="gr">ground</span></h1>
        <p className="overlay-sub">닉네임을 정하고 입장하세요</p>
        <input
          autoFocus maxLength={24} placeholder="닉네임"
          value={name} onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={!connected || !name.trim()}>
          {connected ? '입장' : '연결 중…'}
        </button>
      </form>
    </div>
  );
}
