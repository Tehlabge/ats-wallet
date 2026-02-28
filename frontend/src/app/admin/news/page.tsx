'use client';

import { useEffect, useState } from 'react';
import { getAdminNews, createNews, deleteNews } from '@/lib/api';

interface NewsItem {
  id: number;
  title: string;
  text: string;
  date: string;
  createdAt: string;
}

export default function AdminNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    getAdminNews()
      .then(setNews)
      .catch(() => setNews([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    try {
      await createNews(title.trim(), content.trim(), date);
      setTitle('');
      setContent('');
      setDate(new Date().toISOString().slice(0, 10));
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleteId(id);
    try {
      await deleteNews(id);
      setNews((prev) => prev.filter((n) => n.id !== id));
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Новости</h1>
          <p className="text-slate-500 mt-1">Управление новостями приложения</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90"
        >
          <span className="material-icons-round text-[18px]">add</span>
          Добавить новость
        </button>
      </div>

      {loading && news.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : news.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <span className="material-icons-round text-slate-400 text-[32px]">newspaper</span>
          </div>
          <p className="text-lg font-medium text-slate-900 dark:text-white">Нет новостей</p>
          <p className="text-slate-500 mt-1">Добавьте первую новость</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {news.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-5 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-bold text-slate-900 dark:text-white line-clamp-2">{n.title}</h3>
                <button
                  onClick={() => handleDelete(n.id)}
                  disabled={deleteId === n.id}
                  className="shrink-0 p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  <span className="material-icons-round text-[20px]">{deleteId === n.id ? 'hourglass_empty' : 'delete'}</span>
                </button>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-3 mb-4">{n.text}</p>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="material-icons-round text-[14px]">calendar_today</span>
                {n.date || (() => {
                  try {
                    return new Date(n.createdAt).toLocaleDateString('ru-RU');
                  } catch {
                    return '—';
                  }
                })()}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Новая новость</h2>
              <button onClick={() => setShowForm(false)} className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                <span className="material-icons-round text-[24px]">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Заголовок</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Введите заголовок..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Содержание</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Текст новости..."
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Дата публикации</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3"
                />
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium"
              >
                Отмена
              </button>
              <button
                onClick={handleCreate}
                disabled={!title.trim() || !content.trim() || saving}
                className="px-6 py-2 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
