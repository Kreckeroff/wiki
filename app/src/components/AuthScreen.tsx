import { useState, type FormEvent } from 'react'
import { ArrowRight, Check, LoaderCircle, LockKeyhole } from 'lucide-react'
import type { Bootstrap } from '../types'
import { api, ApiError } from '../lib/api'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface AuthScreenProps {
  onAuthenticated: (data: Bootstrap) => void
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      const data = await api<Bootstrap>(`/api/auth/${mode}`, {
        method: 'POST',
        body: mode === 'register' ? { name, email, password } : { email, password },
      })
      onAuthenticated(data)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Нет связи с сервером. Попробуйте ещё раз.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-story" aria-label="О продукте">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <div className="auth-story-copy">
          <p className="auth-overline">Место для ваших знаний</p>
          <h1>Мысли становятся<br />общей работой.</h1>
          <p>Страницы, проекты и живой Markdown — в одном спокойном редакторе.</p>
        </div>
        <div className="auth-proof">
          <span><Check size={16} /> Живые правки</span>
          <span><Check size={16} /> Полный Markdown</span>
          <span><Check size={16} /> Ваши данные</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-form-heading">
            <span className="auth-lock"><LockKeyhole size={20} /></span>
            <h2>{mode === 'login' ? 'С возвращением' : 'Создайте свой wiki'}</h2>
            <p>{mode === 'login' ? 'Продолжите с того места, где остановились.' : 'Workspace и первый проект появятся сразу.'}</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Вход или регистрация">
            <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setError('') }}>Войти</button>
            <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setError('') }}>Регистрация</button>
          </div>

          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && (
              <label>Как вас называть
                <Input autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Имя" required maxLength={80} autoFocus />
              </label>
            )}
            <label>Почта
              <Input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required autoFocus={mode === 'login'} />
            </label>
            <label>Пароль
              <Input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'register' ? 'Не короче 12 символов' : 'Ваш пароль'} required minLength={mode === 'register' ? 12 : 1} />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <Button className="auth-submit" size="lg" disabled={pending} type="submit">
              {pending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
              {pending ? 'Открываем…' : mode === 'login' ? 'Войти в wiki' : 'Создать workspace'}
            </Button>
          </form>
          <p className="auth-footnote">Ваши страницы доступны только участникам workspace.</p>
        </div>
      </section>
    </main>
  )
}
