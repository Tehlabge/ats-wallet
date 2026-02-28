'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminPanelUsers, createAdminUser, deleteAdminUser, changeAdminPassword, loginAsAdmin, getAdminRole, type AdminUserItem } from '@/lib/api';

export default function AdminOperatorsPage() {
  const router = useRouter();
  const [list, setList] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'super' | 'operator'>('operator');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState('');
  
  const currentRole = typeof window !== 'undefined' ? getAdminRole() : null;
  const isSuper = currentRole === 'super';
  const [success, setSuccess] = useState('');
  
  const [changingPasswordId, setChangingPasswordId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [loggingInAs, setLoggingInAs] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    getAdminPanelUsers()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!login.trim() || password.length < 4) {
      setError('Логин и пароль (мин. 4 символа) обязательны');
      return;
    }
    setCreating(true);
    try {
      await createAdminUser(login.trim(), password, role);
      setSuccess(`Создан: ${login.trim()} (${role === 'operator' ? 'оператор' : 'супер-админ'})`);
      setLogin('');
      setPassword('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Операторы</h1>
        <p className="text-slate-500 mt-1">Пользователи админ-панели. Оператор видит только платежи и чат.</p>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Добавить пользователя</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Логин</label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-48 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              placeholder="operator1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-48 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              placeholder="••••••••"
              minLength={4}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Роль</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'super' | 'operator')}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="operator">Оператор (платежи + чат)</option>
              <option value="super">Супер-админ</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="px-5 py-2.5 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
          >
            {creating ? 'Создание…' : 'Создать'}
          </button>
        </form>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        {success && <p className="text-green-600 dark:text-green-400 text-sm mt-2">{success}</p>}
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white p-4 border-b border-slate-200 dark:border-slate-700">Список</h2>
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="animate-spin w-6 h-6 border-3 border-primary border-t-transparent rounded-full" />
          </div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Нет пользователей</div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {list.map((u) => (
              <li key={u.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-slate-900 dark:text-white">{u.login}</span>
                    <span className="ml-2 text-slate-500 text-sm">
                      {u.role === 'super' ? 'Супер-админ' : 'Оператор'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs mr-2">{new Date(u.createdAt).toLocaleDateString('ru-RU')}</span>
                    
                    {/* Смена пароля */}
                    <button
                      type="button"
                      onClick={() => {
                        setChangingPasswordId(changingPasswordId === u.id ? null : u.id);
                        setNewPassword('');
                      }}
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                      title="Сменить пароль"
                    >
                      <span className="material-icons-round text-[20px]">key</span>
                    </button>
                    
                    {/* Войти под оператором (только для супер-админа и не для себя) */}
                    {isSuper && u.role !== 'super' && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Войти под учёткой "${u.login}"?`)) return;
                          setLoggingInAs(u.id);
                          try {
                            const res = await loginAsAdmin(u.id);
                            localStorage.setItem('ats_admin_token', res.token);
                            localStorage.setItem('ats_admin_role', res.role);
                            setSuccess(`Вход выполнен: ${res.login}`);
                            router.push('/admin');
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Ошибка входа');
                          } finally {
                            setLoggingInAs(null);
                          }
                        }}
                        disabled={loggingInAs === u.id}
                        className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
                        title="Войти под этим аккаунтом"
                      >
                        <span className="material-icons-round text-[20px]">
                          {loggingInAs === u.id ? 'hourglass_empty' : 'login'}
                        </span>
                      </button>
                    )}
                    
                    {/* Удалить */}
                    {isSuper && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Удалить ${u.role === 'super' ? 'супер-админа' : 'оператора'} ${u.login}?`)) return;
                          setDeleting(u.id);
                          try {
                            await deleteAdminUser(u.id);
                            setSuccess(`Удалён: ${u.login}`);
                            load();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Ошибка удаления');
                          } finally {
                            setDeleting(null);
                          }
                        }}
                        disabled={deleting === u.id}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                        title="Удалить"
                      >
                        <span className="material-icons-round text-[20px]">
                          {deleting === u.id ? 'hourglass_empty' : 'delete'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Форма смены пароля */}
                {changingPasswordId === u.id && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center gap-3 flex-wrap">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Новый пароль (мин. 4 символа)"
                      className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (newPassword.length < 4) {
                          setError('Пароль должен быть не менее 4 символов');
                          return;
                        }
                        setPasswordSaving(true);
                        try {
                          await changeAdminPassword(u.id, newPassword);
                          setSuccess(`Пароль изменён для: ${u.login}`);
                          setChangingPasswordId(null);
                          setNewPassword('');
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Ошибка смены пароля');
                        } finally {
                          setPasswordSaving(false);
                        }
                      }}
                      disabled={passwordSaving || newPassword.length < 4}
                      className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {passwordSaving ? '...' : 'Сохранить'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setChangingPasswordId(null); setNewPassword(''); }}
                      className="px-3 py-2 text-slate-500 hover:text-slate-700 text-sm"
                    >
                      Отмена
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
