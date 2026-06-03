'use client';

import { useState, useEffect, useCallback } from 'react';

interface User { id: string; name: string; login_id: string; role: string; client_id?: string | null; password_plain?: string | null; }
interface Client { id: string; name: string; created_at?: string; }
interface ProgressRow {
  user_id: string;
  name: string;
  login_id: string;
  client_id: string | null;
  month: string;
  completed_count: number;
  today_count: number;
  correct_count: number;
  wrong_count: number;
  empty_count: number;
  all_total: number;
  all_correct: number;
}
interface Answer { id: string; user_name: string; user_id: string; client_id: string | null; client_name: string; task_category: string; task_type: string; image_url: string; correct_text: string; answer_text: string; is_correct: boolean; accuracy: number | null; created_at: string; updated_at: string | null; }
interface ReportRow { name: string; ans_count: number; correct_count: number; empty_count: number; rate: string; }
interface SavedReport { id: string; client_id: string | null; month: string; title: string; subtitle: string; rows: ReportRow[]; created_at: string; }

type Tab = 'clients' | 'users' | 'progress' | 'answers';

function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(y, m - i, 1));
    const yy = d.getUTCFullYear();
    const mm = d.getUTCMonth() + 1;
    const value = `${yy}-${String(mm).padStart(2, '0')}`;
    const label = `${yy}年${mm}月`;
    options.push({ value, label });
  }
  return options;
}

// ============================================================
// Admin Page
// ============================================================
export default function AdminPage() {
  const [admin, setAdmin] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('users');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // クライアント
  const [clients, setClients] = useState<Client[]>([]);
  const [newClientName, setNewClientName] = useState('');
  const [clientMsg, setClientMsg] = useState('');

  // ユーザータブ
  const [users, setUsers] = useState<User[]>([]);
  const [newName, setNewName] = useState('');
  const [newLoginId, setNewLoginId] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newUserClientId, setNewUserClientId] = useState('');
  const [userMsg, setUserMsg] = useState('');

  // 進捗タブ
  const [progressRows, setProgressRows] = useState<ProgressRow[]>([]);
  const [quota, setQuota] = useState(750);
  const [quotaInput, setQuotaInput] = useState(750);
  const [quotaMsg, setQuotaMsg] = useState('');
  const [progressClientFilter, setProgressClientFilter] = useState('');
  const [progressMonthFilter, setProgressMonthFilter] = useState('');

  // 保存済み集計
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [saveMsg, setSaveMsg] = useState('');

  // 回答タブ
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [answerUsers, setAnswerUsers] = useState<User[]>([]);
  const [answerFilter, setAnswerFilter] = useState('');
  const [answerClientFilter, setAnswerClientFilter] = useState('');
  const [answersMsg, setAnswersMsg] = useState('');

  const loadClients = useCallback(async (uid: string) => {
    const res = await fetch(`/api/clients?userId=${uid}`);
    const data = await res.json();
    if (data.clients) setClients(data.clients);
  }, []);

  const loadUsers = useCallback(async (uid: string) => {
    const res = await fetch(`/api/users?userId=${uid}`);
    const data = await res.json();
    if (data.users) setUsers(data.users);
    if (data.clients) setClients(data.clients);
  }, []);

  const loadProgress = useCallback(async (uid: string, targetMonth = '') => {
    const params = new URLSearchParams({ userId: uid, mode: 'admin' });
    if (targetMonth) params.set('targetMonth', targetMonth);
    const res = await fetch(`/api/progress?${params.toString()}`);
    const data = await res.json();
    if (data.progress) setProgressRows(data.progress);
    if (data.quota) { setQuota(data.quota); setQuotaInput(data.quota); }
    if (data.clients) setClients(data.clients);
  }, []);

  const loadReports = useCallback(async (uid: string, clientId = '') => {
    const params = new URLSearchParams({ userId: uid });
    if (clientId) params.set('clientId', clientId);
    const res = await fetch(`/api/reports?${params.toString()}`);
    const data = await res.json();
    if (data.reports) setSavedReports(data.reports);
  }, []);

  const loadAnswers = useCallback(async (uid: string, userFilter = '', clientFilter = '') => {
    const params = new URLSearchParams({ userId: uid });
    if (userFilter) params.set('targetUserId', userFilter);
    if (clientFilter) params.set('clientId', clientFilter);
    const res = await fetch(`/api/answers?${params.toString()}`);
    const data = await res.json();
    if (data.answers) setAnswers(data.answers);
    if (data.users) setAnswerUsers(data.users);
    if (data.clients) setClients(data.clients);
    setAnswersMsg(data.answers ? `${data.answers.length}件` : '');
  }, []);

  const handleLogin = async () => {
    setLoginError('');
    const res = await fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password }),
    });
    const data = await res.json();
    if (data.error) { setLoginError(data.error); return; }
    if (data.user.role !== 'admin') { setLoginError('管理者権限がありません'); return; }
    setAdmin(data.user);
    sessionStorage.setItem('adminUser', JSON.stringify(data.user));
    loadClients(data.user.id);
    loadUsers(data.user.id);
    loadProgress(data.user.id);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminUser');
    setAdmin(null);
    setLoginId(''); setPassword('');
  };

  useEffect(() => {
    const saved = sessionStorage.getItem('adminUser');
    if (saved) {
      const u = JSON.parse(saved) as User;
      setAdmin(u);
      loadClients(u.id);
      loadUsers(u.id);
      loadProgress(u.id);
    }
  }, [loadClients, loadUsers, loadProgress]);

  // ===== クライアント管理 =====
  const addClient = async () => {
    setClientMsg('');
    if (!newClientName.trim()) { setClientMsg('⚠️ クライアント名を入力してください'); return; }
    const res = await fetch('/api/clients', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: admin!.id, name: newClientName }),
    });
    const data = await res.json();
    if (data.error) { setClientMsg('⚠️ ' + data.error); return; }
    setClientMsg('✅ 追加しました');
    setNewClientName('');
    loadClients(admin!.id);
  };

  const deleteClient = async (clientId: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？所属ユーザーは未所属になります。`)) return;
    const res = await fetch('/api/clients', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: admin!.id, clientId }),
    });
    const data = await res.json();
    if (data.error) { alert('⚠️ ' + data.error); return; }
    loadClients(admin!.id);
    loadUsers(admin!.id);
  };

  // ===== ユーザー管理 =====
  const addUser = async () => {
    setUserMsg('');
    const res = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: admin!.id, name: newName, loginId: newLoginId, password: newPass, role: newRole, clientId: newUserClientId || null }),
    });
    const data = await res.json();
    if (data.error) { setUserMsg('⚠️ ' + data.error); return; }
    setUserMsg('✅ 追加しました');
    setNewName(''); setNewLoginId(''); setNewPass('');
    loadUsers(admin!.id);
  };

  const changeUserClient = async (targetUserId: string, clientId: string) => {
    const res = await fetch('/api/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: admin!.id, targetUserId, clientId }),
    });
    const data = await res.json();
    if (data.error) { alert('⚠️ ' + data.error); return; }
    loadUsers(admin!.id);
  };

  const resetPw = async (targetUserId: string, name: string) => {
    const np = prompt(`${name} さんの新しいパスワード`);
    if (!np) return;
    const res = await fetch('/api/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: admin!.id, targetUserId, newPassword: np }),
    });
    const data = await res.json();
    alert(data.error ? '⚠️ ' + data.error : '✅ パスワードを変更しました');
  };

  // ===== 進捗 =====
  const saveQuota = async () => {
    const res = await fetch('/api/progress', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: admin!.id, quota: quotaInput }),
    });
    const data = await res.json();
    if (data.error) { setQuotaMsg('⚠️ ' + data.error); return; }
    setQuota(data.quota); setQuotaMsg('✅ 保存しました');
    loadProgress(admin!.id, progressMonthFilter);
  };

  // ===== 集計保存 =====
  const saveReport = async (title: string, subtitle: string, rows: ReportRow[]) => {
    setSaveMsg('');
    const res = await fetch('/api/reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: admin!.id,
        clientId: progressClientFilter || null,
        month: progressMonthFilter,
        title,
        subtitle,
        rows,
      }),
    });
    const data = await res.json();
    if (data.error) { setSaveMsg('⚠️ ' + data.error); return; }
    setSaveMsg('✅ 保存しました');
    loadReports(admin!.id, progressClientFilter);
  };

  const deleteReport = async (reportId: string) => {
    if (!confirm('この集計を削除しますか？')) return;
    const res = await fetch('/api/reports', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: admin!.id, reportId }),
    });
    const data = await res.json();
    if (data.error) { alert('⚠️ ' + data.error); return; }
    loadReports(admin!.id, progressClientFilter);
  };

  // ===== オンデマンドレシート生成診断 =====
  type DiagProbe = { model: string; status: number | string; ok: boolean; durationMs: number; sample?: string; error?: string };
  type DiagResult = { ok: boolean; env?: Record<string, boolean>; probe?: DiagProbe[]; recommendedModel?: string; error?: string };
  const [diagResult, setDiagResult] = useState<DiagResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [genTestResult, setGenTestResult] = useState<{ count: number; partial?: boolean; totalMs?: number; lastModel?: string; error?: string; sample?: string } | null>(null);
  const [genTestLoading, setGenTestLoading] = useState(false);

  const runDiagnostic = async () => {
    setDiagLoading(true); setDiagResult(null);
    try {
      const res = await fetch('/api/admin/ondemand-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: admin!.id }),
      });
      const data = await res.json();
      setDiagResult(data);
    } catch (e) {
      setDiagResult({ ok: false, error: '通信エラー: ' + (e as Error).message });
    } finally {
      setDiagLoading(false);
    }
  };

  const runGenTest = async () => {
    setGenTestLoading(true); setGenTestResult(null);
    try {
      const t0 = Date.now();
      const res = await fetch('/api/ondemand-tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: admin!.id, count: 5, category: 'レシート' }),
      });
      const data = await res.json();
      setGenTestResult({
        count: data.count ?? 0,
        partial: data.partial,
        totalMs: data.diagnostics?.totalMs ?? (Date.now() - t0),
        lastModel: data.diagnostics?.lastModel,
        error: data.error,
        sample: Array.isArray(data.texts) && data.texts[0] ? String(data.texts[0]).slice(0, 120) : undefined,
      });
    } catch (e) {
      setGenTestResult({ count: 0, error: '通信エラー: ' + (e as Error).message });
    } finally {
      setGenTestLoading(false);
    }
  };

  const backfillAccuracy = async () => {
    if (!confirm('既存の回答の正答率を再計算します（時間がかかる場合があります）。実行しますか？')) return;
    const res = await fetch('/api/admin/backfill-accuracy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: admin!.id }),
    });
    const data = await res.json();
    if (data.error) { alert('⚠️ ' + data.error); return; }
    alert(`✅ 完了：${data.updated} / ${data.scanned} 件を更新しました`);
    loadProgress(admin!.id, progressMonthFilter);
    loadAnswers(admin!.id, answerFilter, answerClientFilter);
  };

  const clientNameOf = (cid: string | null | undefined) => {
    if (!cid) return '';
    return clients.find(c => c.id === cid)?.name ?? '';
  };

  const csvEscape = (v: string | number | null | undefined) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const monthLabel = (ym: string) => {
    if (!ym) return '';
    const [y, m] = ym.split('-').map(Number);
    return `${y}年${m}月`;
  };

  const downloadAllTimeCsv = () => {
    const rows = progressClientFilter
      ? progressRows.filter(p => p.client_id === progressClientFilter)
      : progressRows;
    if (!rows.length) return;
    const header = 'client_name,name,login_id,回答数,正答数,正答率\n';
    const body = rows.map(p => {
      const ratio = p.all_total > 0 ? ((p.all_correct / p.all_total) * 100).toFixed(1) + '%' : '';
      return [
        clientNameOf(p.client_id), p.name, p.login_id,
        p.all_total, p.all_correct, ratio,
      ].map(csvEscape).join(',');
    }).join('\n');
    const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `集計${progressClientFilter ? '_' + clientNameOf(progressClientFilter) : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadProgressCsv = () => {
    const rows = progressClientFilter
      ? progressRows.filter(p => p.client_id === progressClientFilter)
      : progressRows;
    if (!rows.length) return;
    const header = 'client_name,name,login_id,month,today_count,completed_count,correct_count,wrong_count,empty_count\n';
    const body = rows.map(p => [
      clientNameOf(p.client_id), p.name, p.login_id, p.month,
      p.today_count, p.completed_count, p.correct_count, p.wrong_count, p.empty_count,
    ].map(csvEscape).join(',')).join('\n');
    const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    const suffix = [progressMonthFilter, progressClientFilter ? clientNameOf(progressClientFilter) : ''].filter(Boolean).join('_');
    a.download = `progress${suffix ? '_' + suffix : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAnswersCsv = () => {
    if (!answers.length) return;
    const header = 'date,client_name,user_name,task_id,task_category,answer_text,is_correct,accuracy,is_empty,created_at,updated_at\n';
    const body = answers.map(a => {
      const isEmpty = !a.answer_text || a.answer_text.trim() === '' || a.answer_text === '{"items":[]}';
      const date = a.created_at ? new Date(a.created_at).toLocaleDateString('ja-JP') : '';
      const acc = a.accuracy != null ? (a.accuracy * 100).toFixed(1) + '%' : '';
      return [
        date, a.client_name, a.user_name, a.id, a.task_category,
        a.answer_text, a.is_correct ? '正解' : '不正解', acc, isEmpty ? '未入力' : '',
        a.created_at, a.updated_at ?? '',
      ].map(csvEscape).join(',');
    }).join('\n');
    const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `answers${answerClientFilter ? '_' + clientNameOf(answerClientFilter) : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== ログイン画面 =====
  if (!admin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f7f8fc' }}>
        <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '40px 32px', width: 400 }}>
          <h2 style={{ fontSize: 20, color: '#1a202c', marginBottom: 24, textAlign: 'center' }}>⌨️ 絆データワークス 管理者ログイン</h2>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>ログインID</label>
            <input style={S.input} type="text" value={loginId} onChange={e => setLoginId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} autoComplete="username" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={S.label}>パスワード</label>
            <input style={S.input} type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} autoComplete="current-password" />
          </div>
          <button style={S.addBtn} onClick={handleLogin}>ログイン</button>
          {loginError && <p style={{ color: '#e53e3e', fontSize: 13, marginTop: 8 }}>{loginError}</p>}
        </div>
      </div>
    );
  }

  // ===== 管理画面 =====
  return (
    <div style={{ fontFamily: "'Noto Sans JP', sans-serif", background: '#f7f8fc', minHeight: '100vh' }}>
      {/* ヘッダー */}
      <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>⌨️ 絆データワークス 管理者パネル</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={S.headerBtn} onClick={handleLogout}>ログアウト</button>
        </div>
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 32px 0', borderBottom: '2px solid #e2e8f0', background: '#fff' }}>
        {(['clients', 'users', 'progress', 'answers'] as Tab[]).map(t => (
          <button key={t} style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}
            onClick={() => { setTab(t); if (t === 'answers' && admin) loadAnswers(admin.id, answerFilter, answerClientFilter); }}>
            {t === 'clients' ? '🏢 クライアント' : t === 'users' ? '👥 ユーザー' : t === 'progress' ? '📊 進捗' : '📝 回答管理'}
          </button>
        ))}
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>

        {/* ===== クライアントタブ ===== */}
        {tab === 'clients' && (
          <>
            <div style={S.card}>
              <h3 style={S.cardTitle}>➕ 新規クライアント追加</h3>
              <div style={S.row}>
                <input style={S.rowInput} type="text" placeholder="会社名・クライアント名" value={newClientName}
                  onChange={e => setNewClientName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addClient()} />
                <button style={S.addBtn} onClick={addClient}>追加</button>
              </div>
              {clientMsg && <p style={clientMsg.includes('⚠️') ? S.err : S.msg}>{clientMsg}</p>}
            </div>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead><tr><th style={S.th}>クライアント名</th><th style={S.th}>所属ユーザー数</th><th style={S.th}>操作</th></tr></thead>
                <tbody>
                  {clients.map(c => (
                    <tr key={c.id}>
                      <td style={S.td}>{c.name}</td>
                      <td style={S.td}>{users.filter(u => u.client_id === c.id).length}</td>
                      <td style={S.td}><button style={S.delBtn} onClick={() => deleteClient(c.id, c.name)}>🗑️ 削除</button></td>
                    </tr>
                  ))}
                  {!clients.length && <tr><td style={S.td} colSpan={3}>クライアントが登録されていません</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ===== ユーザータブ ===== */}
        {tab === 'users' && (
          <>
            <div style={S.card}>
              <h3 style={S.cardTitle}>➕ 新規ユーザー追加</h3>
              <div style={S.row}>
                <input style={S.rowInput} type="text" placeholder="名前" value={newName} onChange={e => setNewName(e.target.value)} />
                <input style={S.rowInput} type="text" placeholder="ログインID" value={newLoginId} onChange={e => setNewLoginId(e.target.value)} />
                <input style={S.rowInput} type="password" placeholder="パスワード" value={newPass} onChange={e => setNewPass(e.target.value)} />
                <select style={S.rowInput} value={newRole} onChange={e => setNewRole(e.target.value)}>
                  <option value="user">利用者</option>
                  <option value="admin">管理者</option>
                </select>
                <select style={S.rowInput} value={newUserClientId} onChange={e => setNewUserClientId(e.target.value)}>
                  <option value="">クライアント未選択</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button style={S.addBtn} onClick={addUser}>追加</button>
              </div>
              {userMsg && <p style={userMsg.includes('⚠️') ? S.err : S.msg}>{userMsg}</p>}
            </div>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead><tr><th style={S.th}>名前</th><th style={S.th}>ログインID</th><th style={S.th}>パスワード</th><th style={S.th}>権限</th><th style={S.th}>クライアント</th><th style={S.th}>操作</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={S.td}>{u.name}</td>
                      <td style={S.td}>{u.login_id}</td>
                      <td style={S.td}>
                        {u.password_plain
                          ? <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#2d3748', background: '#fff5d7', padding: '2px 8px', borderRadius: 4 }}>{u.password_plain}</span>
                          : <span style={{ fontSize: 12, color: '#a0aec0' }} title="既存ユーザー（移行分）または未確認。PW変更で表示されます">—</span>}
                      </td>
                      <td style={S.td}>{u.role === 'admin' ? '管理者' : '利用者'}</td>
                      <td style={S.td}>
                        <select style={{ ...S.rowInput, padding: '4px 8px', minWidth: 120 }}
                          value={u.client_id ?? ''}
                          onChange={e => changeUserClient(u.id, e.target.value)}>
                          <option value="">未所属</option>
                          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td style={S.td}><button style={S.resetBtn} onClick={() => resetPw(u.id, u.name)}>PW変更</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ===== 進捗タブ ===== */}
        {tab === 'progress' && (
          <>
            <div style={S.card}>
              <h3 style={S.cardTitle}>⚙️ 月間クォータ設定</h3>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input type="number" value={quotaInput} min={1} onChange={e => setQuotaInput(parseInt(e.target.value) || 750)}
                  style={{ width: 100, border: '2px solid #e2e8f0', borderRadius: 8, padding: 8, fontFamily: 'inherit', fontSize: 14 }} />
                <button style={S.addBtn} onClick={saveQuota}>保存</button>
                {quotaMsg && <span style={{ fontSize: 13, color: '#276749' }}>{quotaMsg}</span>}
              </div>
            </div>

            {/* フィルター行 */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <select style={{ ...S.rowInput, maxWidth: 200 }} value={progressClientFilter} onChange={e => { setProgressClientFilter(e.target.value); loadReports(admin.id, e.target.value); setSaveMsg(''); }}>
                <option value="">全クライアント</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                style={{ ...S.rowInput, maxWidth: 200 }}
                value={progressMonthFilter}
                onChange={e => {
                  const v = e.target.value;
                  setProgressMonthFilter(v);
                  loadProgress(admin.id, v);
                }}
              >
                <option value="">対象月：すべて</option>
                {getMonthOptions().map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {progressMonthFilter && (
                <span style={{ fontSize: 13, color: '#667eea', fontWeight: 700 }}>
                  対象月：{monthLabel(progressMonthFilter)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <button style={S.csvBtn} onClick={downloadProgressCsv}>📥 進捗CSV</button>
              <button style={S.csvBtn} onClick={downloadAllTimeCsv}>📈 集計CSV（全期間）</button>
              <button style={{ ...S.csvBtn, borderColor: '#fbd38d', background: '#fffaf0', color: '#9c4221' }}
                onClick={backfillAccuracy} title="過去の回答の正答率を再計算して埋めます">
                🔄 過去分の正答率を再計算
              </button>
            </div>

            {/* オンデマンドレシート生成診断 */}
            <div style={{ ...S.card, border: '2px solid #90cdf4', background: '#ebf8ff' }}>
              <h3 style={{ ...S.cardTitle, color: '#2b6cb0' }}>🔧 オンデマンドレシート生成診断</h3>
              <p style={{ fontSize: 13, color: '#2c5282', marginBottom: 12 }}>
                利用者の「次へ」ボタンで動くレシートテキスト生成（Gemini → Canvas描画）が安定して動くかをテストします。
                失敗が続く場合はここで原因を確認してください。
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <button style={{ ...S.addBtn, background: 'linear-gradient(135deg,#4299e1,#2b6cb0)', opacity: diagLoading ? 0.6 : 1 }}
                  onClick={runDiagnostic} disabled={diagLoading}>
                  🔧 接続診断（Geminiに疎通確認）
                </button>
                <button style={{ ...S.addBtn, background: 'linear-gradient(135deg,#4299e1,#2b6cb0)', opacity: genTestLoading ? 0.6 : 1 }}
                  onClick={runGenTest} disabled={genTestLoading}>
                  📦 5件生成テスト
                </button>
              </div>

              {diagLoading && <p style={{ fontSize: 13, color: '#2c5282' }}>⏳ 診断中…</p>}
              {diagResult && (
                <div style={{ background: '#fff', padding: 12, borderRadius: 8, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: diagResult.ok ? '#276749' : '#c53030', marginBottom: 6 }}>
                    {diagResult.ok ? `✅ 接続OK (推奨モデル: ${diagResult.recommendedModel ?? '-'})` : `⚠️ 接続NG: ${diagResult.error ?? ''}`}
                  </div>
                  {diagResult.env && (
                    <div style={{ marginBottom: 6 }}>
                      環境変数: GEMINI_API_KEY={diagResult.env.GEMINI_API_KEY ? '✓' : '✗'},
                      SUPABASE_URL={diagResult.env.NEXT_PUBLIC_SUPABASE_URL ? '✓' : '✗'},
                      SUPABASE_KEY={diagResult.env.SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗'}
                    </div>
                  )}
                  {diagResult.probe?.map((p, i) => (
                    <div key={i} style={{ color: p.ok ? '#276749' : '#c53030' }}>
                      [{i + 1}] {p.model}: status={String(p.status)} {p.durationMs}ms{p.error ? ` err=${p.error.slice(0, 80)}` : ''}{p.sample ? ` sample=${p.sample.slice(0, 60)}` : ''}
                    </div>
                  ))}
                </div>
              )}

              {genTestLoading && <p style={{ fontSize: 13, color: '#2c5282' }}>⏳ 5件生成中…（10〜30秒程度）</p>}
              {genTestResult && (
                <div style={{ background: '#fff', padding: 12, borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}>
                  <div style={{ fontWeight: 700, color: genTestResult.count > 0 ? '#276749' : '#c53030', marginBottom: 6 }}>
                    {genTestResult.count > 0
                      ? `✅ ${genTestResult.count}件取得（${genTestResult.totalMs}ms, モデル: ${genTestResult.lastModel ?? '-'}）${genTestResult.partial ? ' ⚠️部分結果' : ''}`
                      : `⚠️ 取得失敗: ${genTestResult.error ?? ''}`}
                  </div>
                  {genTestResult.sample && (
                    <div style={{ color: '#4a5568', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      サンプル: {genTestResult.sample}…
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 集計表（全期間 or 月別） */}
            {(() => {
              const filtered = progressClientFilter
                ? progressRows.filter(p => p.client_id === progressClientFilter)
                : progressRows;
              if (!filtered.length) return null;

              const isMonthFiltered = !!progressMonthFilter;
              const selectedClientName = progressClientFilter ? clientNameOf(progressClientFilter) : '';

              let tableTitle = '📈 全期間集計';
              let tableSubtitle = '';

              if (isMonthFiltered) {
                const [y, m] = progressMonthFilter.split('-').map(Number);
                if (selectedClientName) {
                  tableTitle = `${m}月 ${selectedClientName}様 集計結果`;
                } else {
                  tableTitle = `${y}年${m}月 集計結果`;
                }
              }

              const totalAns = isMonthFiltered
                ? filtered.reduce((s, r) => s + r.correct_count + r.wrong_count + r.empty_count, 0)
                : filtered.reduce((s, r) => s + r.all_total, 0);
              const totalCorrect = isMonthFiltered
                ? filtered.reduce((s, r) => s + r.correct_count, 0)
                : filtered.reduce((s, r) => s + r.all_correct, 0);
              const overallRate = totalAns > 0 ? ((totalCorrect / totalAns) * 100).toFixed(1) + '%' : '—';

              if (isMonthFiltered) {
                tableSubtitle = `対象月：${monthLabel(progressMonthFilter)}／合計 回答 ${totalAns.toLocaleString()} 件、正答 ${totalCorrect.toLocaleString()} 件、正答率 ${overallRate}`;
              } else {
                tableSubtitle = `合計 回答 ${totalAns.toLocaleString()} 件、正答 ${totalCorrect.toLocaleString()} 件、正答率 ${overallRate}`;
              }

              const sorted = [...filtered].sort((a, b) => {
                const aAns = isMonthFiltered ? (a.correct_count + a.wrong_count + a.empty_count) : a.all_total;
                const bAns = isMonthFiltered ? (b.correct_count + b.wrong_count + b.empty_count) : b.all_total;
                return bAns - aAns;
              });

              const reportRows: ReportRow[] = sorted.map(p => {
                const ac = isMonthFiltered ? p.correct_count + p.wrong_count + p.empty_count : p.all_total;
                const cc = isMonthFiltered ? p.correct_count : p.all_correct;
                return { name: p.name, ans_count: ac, correct_count: cc, empty_count: p.empty_count, rate: ac > 0 ? ((cc / ac) * 100).toFixed(1) + '%' : '—' };
              });

              return (
                <div style={{ ...S.card, padding: 0, overflow: 'hidden', border: '2px solid #cbd5e0' }}>
                  <div style={{ padding: '14px 20px', background: 'linear-gradient(90deg,#ebf8ff,#fff)', borderBottom: '1px solid #cbd5e0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#2d3748', marginBottom: 4 }}>{tableTitle}</div>
                      <div style={{ fontSize: 12, color: '#718096' }}>{tableSubtitle}</div>
                    </div>
                    {isMonthFiltered && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        <button
                          style={{ ...S.addBtn, fontSize: 13, padding: '8px 16px' }}
                          onClick={() => saveReport(tableTitle, tableSubtitle, reportRows)}
                        >
                          📤 保存
                        </button>
                        {saveMsg && <span style={{ fontSize: 12, color: saveMsg.includes('⚠️') ? '#c53030' : '#276749' }}>{saveMsg}</span>}
                      </div>
                    )}
                  </div>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>名前</th>
                        {!isMonthFiltered && <th style={S.th}>クライアント</th>}
                        <th style={S.th}>回答数</th>
                        <th style={S.th}>正答数</th>
                        {isMonthFiltered && <th style={S.th}>未入力数</th>}
                        <th style={S.th}>正答率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(p => {
                        const ansCount = isMonthFiltered
                          ? p.correct_count + p.wrong_count + p.empty_count
                          : p.all_total;
                        const correctCount = isMonthFiltered ? p.correct_count : p.all_correct;
                        const rate = ansCount > 0 ? ((correctCount / ansCount) * 100).toFixed(1) + '%' : '—';
                        return (
                          <tr key={p.user_id}>
                            <td style={S.td}>{p.name}</td>
                            {!isMonthFiltered && (
                              <td style={{ ...S.td, fontSize: 12, color: '#4a5568' }}>{clientNameOf(p.client_id) || '—'}</td>
                            )}
                            <td style={S.td}>{ansCount.toLocaleString()}</td>
                            <td style={S.td}>{correctCount.toLocaleString()}</td>
                            {isMonthFiltered && <td style={S.td}>{p.empty_count.toLocaleString()}</td>}
                            <td style={{ ...S.td, fontWeight: 700, color: ansCount > 0 ? '#276749' : '#a0aec0' }}>{rate}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* クライアント別進捗ブロック */}
            {(() => {
              const filtered = progressClientFilter
                ? progressRows.filter(p => p.client_id === progressClientFilter)
                : progressRows;

              const isMonthFiltered = !!progressMonthFilter;
              const currentMonthLabel = isMonthFiltered
                ? monthLabel(progressMonthFilter)
                : '今月';

              const groups = new Map<string, ProgressRow[]>();
              for (const p of filtered) {
                const key = p.client_id ?? '__none__';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(p);
              }

              return Array.from(groups.entries()).map(([key, rows]) => {
                const clientName = key === '__none__' ? '（未所属）' : (clients.find(c => c.id === key)?.name ?? '（不明）');
                const today = rows.reduce((s, r) => s + r.today_count, 0);
                const completed = rows.reduce((s, r) => s + r.completed_count, 0);
                const correct = rows.reduce((s, r) => s + r.correct_count, 0);
                const wrong = rows.reduce((s, r) => s + r.wrong_count, 0);
                const empty = rows.reduce((s, r) => s + r.empty_count, 0);
                const answered = correct + wrong;
                const accuracyPct = answered > 0 ? ((correct / answered) * 100).toFixed(1) : '—';
                const totalQuota = quota * rows.length;
                return (
                  <div key={key} style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 20px', background: 'linear-gradient(90deg,#edf2f7,#fff)', borderBottom: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#2d3748', marginBottom: 6 }}>【{clientName}】</div>
                      <div style={{ fontSize: 13, color: '#4a5568', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                        {!isMonthFiltered && <span>本日完了：<b>{today}</b>件</span>}
                        <span>{currentMonthLabel}進捗：<b>{completed}</b> / {totalQuota}</span>
                        <span>正解：<b>{correct}</b>件</span>
                        <span>不正解：<b>{wrong}</b>件</span>
                        <span>未入力：<b>{empty}</b>件</span>
                        <span>正答率：<b style={{ color: '#276749' }}>{accuracyPct}{accuracyPct !== '—' ? '%' : ''}</b></span>
                        <span>利用者数：<b>{rows.length}</b>人</span>
                      </div>
                    </div>
                    <table style={S.table}>
                      <thead>
                        <tr>
                          <th style={S.th}>名前</th>
                          <th style={S.th}>ログインID</th>
                          {!isMonthFiltered && <th style={S.th}>本日</th>}
                          <th style={S.th}>{currentMonthLabel}</th>
                          <th style={S.th}>正</th>
                          <th style={S.th}>誤</th>
                          <th style={S.th}>未入力</th>
                          <th style={S.th}>正答率</th>
                          <th style={S.th}>進捗</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(p => {
                          const ans = p.correct_count + p.wrong_count;
                          const rate = ans > 0 ? ((p.correct_count / ans) * 100).toFixed(1) + '%' : '—';
                          return (
                            <tr key={p.user_id}>
                              <td style={S.td}>{p.name}</td>
                              <td style={S.td}>{p.login_id}</td>
                              {!isMonthFiltered && <td style={S.td}>{p.today_count}</td>}
                              <td style={S.td}>{p.completed_count} / {quota}</td>
                              <td style={S.td}>{p.correct_count}</td>
                              <td style={S.td}>{p.wrong_count}</td>
                              <td style={S.td}>{p.empty_count}</td>
                              <td style={{ ...S.td, fontWeight: 700, color: ans > 0 ? '#276749' : '#a0aec0' }}>{rate}</td>
                              <td style={S.td}>
                                <div style={{ background: '#e2e8f0', borderRadius: 6, height: 10, width: 140, overflow: 'hidden' }}>
                                  <div style={{ background: 'linear-gradient(90deg,#667eea,#764ba2)', height: '100%', width: `${Math.min(100, (p.completed_count / quota) * 100).toFixed(0)}%`, borderRadius: 6 }} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              });
            })()}
          </>
        )}

        {/* ===== 保存済み集計一覧（進捗タブ内） ===== */}
        {tab === 'progress' && progressClientFilter && savedReports.length > 0 && (
          <div style={{ ...S.card, marginTop: 8 }}>
            <h3 style={{ ...S.cardTitle, marginBottom: 16 }}>📁 保存済み集計（{clientNameOf(progressClientFilter)}）</h3>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>タイトル</th>
                    <th style={S.th}>対象月</th>
                    <th style={S.th}>保存日時</th>
                    <th style={S.th}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {savedReports.map(r => (
                    <tr key={r.id}>
                      <td style={S.td}>{r.title}</td>
                      <td style={{ ...S.td, fontSize: 12, color: '#4a5568' }}>{monthLabel(r.month)}</td>
                      <td style={{ ...S.td, fontSize: 12, color: '#718096' }}>
                        {new Date(r.created_at).toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={S.td}>
                        <button style={S.delBtn} onClick={() => deleteReport(r.id)}>🗑️ 削除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== 回答管理タブ ===== */}
        {tab === 'answers' && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <select style={S.rowInput} value={answerClientFilter}
                onChange={e => { setAnswerClientFilter(e.target.value); loadAnswers(admin.id, answerFilter, e.target.value); }}>
                <option value="">全クライアント</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select style={S.rowInput} value={answerFilter}
                onChange={e => { setAnswerFilter(e.target.value); loadAnswers(admin.id, e.target.value, answerClientFilter); }}>
                <option value="">全ユーザー</option>
                {answerUsers
                  .filter(u => !answerClientFilter || u.client_id === answerClientFilter)
                  .map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button style={S.csvBtn} onClick={downloadAnswersCsv}>📥 回答CSV</button>
              <span style={{ fontSize: 13, color: '#718096' }}>{answersMsg}</span>
            </div>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>クライアント</th>
                    <th style={S.th}>ユーザー</th>
                    <th style={S.th}>日時</th>
                    <th style={S.th}>カテゴリ</th>
                    <th style={S.th}>回答</th>
                    <th style={S.th}>正解テキスト</th>
                    <th style={S.th}>正誤</th>
                    <th style={S.th}>正答率</th>
                  </tr>
                </thead>
                <tbody>
                  {answers.map(a => {
                    const date = a.created_at ? new Date(a.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
                    let ansDisplay = a.answer_text;
                    try { const p = JSON.parse(ansDisplay); if (p.items) ansDisplay = p.items.map((it: { name: string; price: number }) => `${it.name} ¥${Number(it.price).toLocaleString()}`).join('\n'); } catch { /* ignore */ }
                    let correctDisplay = a.correct_text;
                    try { const p = JSON.parse(correctDisplay); if (p.store !== undefined) correctDisplay = `[${p.store}] ${p.date || ''}\n${(p.items || []).map((it: { name: string; price: number }) => `${it.name} ¥${Number(it.price).toLocaleString()}`).join('\n')}`; } catch { /* ignore */ }
                    return (
                      <tr key={a.id}>
                        <td style={{ ...S.td, fontSize: 12, color: '#4a5568' }}>{a.client_name || '—'}</td>
                        <td style={S.td}>{a.user_name}</td>
                        <td style={{ ...S.td, fontSize: 12, color: '#718096' }}>{date}{a.updated_at ? ' ✎' : ''}</td>
                        <td style={{ ...S.td, fontSize: 12, color: '#667eea' }}>{a.task_category}</td>
                        <td style={{ ...S.td, whiteSpace: 'pre-wrap', maxWidth: 180 }}>{ansDisplay}</td>
                        <td style={{ ...S.td, whiteSpace: 'pre-wrap', maxWidth: 180, color: '#718096' }}>{correctDisplay}</td>
                        <td style={S.td}>
                          <span style={{ background: a.is_correct ? '#c6f6d5' : '#fed7d7', color: a.is_correct ? '#276749' : '#c53030', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
                            {a.is_correct ? '正解' : '不正解'}
                          </span>
                        </td>
                        <td style={{ ...S.td, fontSize: 12, color: '#4a5568' }}>
                          {a.accuracy != null ? `${(a.accuracy * 100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const S = {
  label: { display: 'block', fontSize: 13, fontWeight: 700, color: '#718096', marginBottom: 4 } as React.CSSProperties,
  input: { width: '100%', border: '2px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' } as React.CSSProperties,
  addBtn: { padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' } as React.CSSProperties,
  headerBtn: { background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 } as React.CSSProperties,
  tab: { padding: '12px 20px', borderRadius: '8px 8px 0 0', border: 'none', background: '#f7f8fc', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#718096' } as React.CSSProperties,
  tabActive: { background: '#667eea', color: '#fff' } as React.CSSProperties,
  card: { background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' } as React.CSSProperties,
  cardTitle: { fontSize: 15, color: '#4a5568', marginBottom: 12, margin: '0 0 12px' } as React.CSSProperties,
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 } as React.CSSProperties,
  rowInput: { flex: 1, minWidth: 140, border: '2px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none' } as React.CSSProperties,
  tableWrap: { overflow: 'auto', borderRadius: 12, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 20 } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as React.CSSProperties,
  th: { background: '#f7f8fc', padding: '12px 16px', textAlign: 'left', color: '#4a5568', fontWeight: 700 } as React.CSSProperties,
  td: { padding: '12px 16px', borderTop: '1px solid #f0f4f8', color: '#2d3748' } as React.CSSProperties,
  resetBtn: { padding: '4px 12px', borderRadius: 6, border: '1px solid #90cdf4', background: '#ebf8ff', color: '#2b6cb0', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' } as React.CSSProperties,
  csvBtn: { padding: '8px 16px', borderRadius: 10, border: '1px solid #68d391', background: '#f0fff4', color: '#276749', cursor: 'pointer', fontWeight: 700, fontSize: 13, marginBottom: 16, fontFamily: 'inherit' } as React.CSSProperties,
  msg: { fontSize: 13, marginTop: 8, color: '#276749' } as React.CSSProperties,
  err: { fontSize: 13, marginTop: 8, color: '#e53e3e' } as React.CSSProperties,
  delBtn: { padding: '6px 10px', borderRadius: 8, border: 'none', background: '#fff5f5', color: '#e53e3e', cursor: 'pointer', fontSize: 12 } as React.CSSProperties,
};
