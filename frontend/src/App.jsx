import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, Droplet, Moon, RefreshCw, RotateCcw, Sun, Trash2
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine
} from 'recharts'

const API = 'http://127.0.0.1:8000'

const SAMPLE = {
  pregnancies: 6, glucose: 148, blood_pressure: 72, skin_thickness: 35,
  insulin: 0, bmi: 33.6, diabetes_pedigree: 0.627, age: 50
}

// Inputs are grouped the way a person thinks about them, not in dataset column order.
const GROUPS = [
  { id: 'about', title: 'Background' },
  { id: 'clinical', title: 'Measurements' }
]

const FIELDS = [
  { key: 'age', label: 'Age', unit: 'years', feature: 'Age', slider: 1, fallbackMax: 100, group: 'about' },
  { key: 'pregnancies', label: 'Pregnancies', unit: 'times', feature: 'Pregnancies', slider: 1, fallbackMax: 20, group: 'about' },
  { key: 'diabetes_pedigree', label: 'Diabetes pedigree', unit: 'score', feature: 'DiabetesPedigreeFunction', slider: 0.001, fallbackMax: 2.5, group: 'about' },
  { key: 'glucose', label: 'Glucose', unit: 'mg/dL', feature: 'Glucose', slider: 1, fallbackMax: 200, group: 'clinical', zeroIsMissing: true },
  { key: 'blood_pressure', label: 'Blood pressure', unit: 'mm Hg', feature: 'BloodPressure', slider: 1, fallbackMax: 125, group: 'clinical', zeroIsMissing: true },
  { key: 'skin_thickness', label: 'Skin thickness', unit: 'mm', feature: 'SkinThickness', slider: 1, fallbackMax: 100, group: 'clinical', zeroIsMissing: true },
  { key: 'insulin', label: 'Insulin', unit: 'µU/mL', feature: 'Insulin', slider: 1, fallbackMax: 850, group: 'clinical', zeroIsMissing: true },
  { key: 'bmi', label: 'BMI', unit: 'kg/m²', feature: 'BMI', slider: 0.1, fallbackMax: 70, group: 'clinical', zeroIsMissing: true }
]

const FEATURE_LABEL = {
  Pregnancies: 'Pregnancies', Glucose: 'Glucose', BloodPressure: 'Blood pressure',
  SkinThickness: 'Skin thickness', Insulin: 'Insulin', BMI: 'BMI',
  DiabetesPedigreeFunction: 'Diabetes pedigree', Age: 'Age'
}

const CHART_COLORS = {
  light: { ok: '#0B7F6B', risk: '#C93A22', grid: '#D3DEE1', text: '#566B73', ink: '#10262E' },
  dark: { ok: '#4FD1B5', risk: '#FF8C75', grid: '#21383F', text: '#92A9B0', ink: '#E5F0F2' }
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const fmt = n => Number(Number(n).toFixed(2)).toString()
const pct = n => `${(n * 100).toFixed(1)}%`
const isValid = v => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0

function readHistory() {
  try { return JSON.parse(localStorage.getItem('dia-history') || '[]') } catch { return [] }
}

function initialTheme() {
  const saved = localStorage.getItem('dia-dark')
  if (saved !== null) return saved === '1'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export default function App() {
  const [form, setForm] = useState(SAMPLE)
  const [analytics, setAnalytics] = useState(null)
  const [serverDown, setServerDown] = useState(false)
  const [result, setResult] = useState(null)
  const [resultInputs, setResultInputs] = useState('')
  const [history, setHistory] = useState(readHistory)
  const [page, setPage] = useState('predict')
  const [dark, setDark] = useState(initialTheme)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const resultRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('dia-dark', dark ? '1' : '0')
  }, [dark])

  const loadAnalytics = useCallback(() => {
    fetch(`${API}/analytics`)
      .then(r => { if (!r.ok) throw new Error('bad response'); return r.json() })
      .then(data => { setAnalytics(data); setServerDown(false) })
      .catch(() => setServerDown(true))
  }, [])

  useEffect(() => { loadAnalytics() }, [loadAnalytics])

  const allValid = FIELDS.every(f => isValid(form[f.key]))
  const stale = Boolean(result) && resultInputs !== JSON.stringify(form)

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const reset = () => { setForm(SAMPLE); setResult(null); setError('') }

  const predict = async event => {
    event?.preventDefault()
    if (!allValid || loading) return
    setLoading(true)
    setError('')
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)]))
      const response = await fetch(`${API}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'The model could not make a prediction.')
      setServerDown(false)
      setResult({ ...data, at: Date.now() })
      setResultInputs(JSON.stringify(form))
      const item = {
        id: Date.now(), date: new Date().toLocaleString(), prediction: data.prediction,
        glucose: form.glucose, bmi: form.bmi, age: form.age, inputs: form
      }
      const next = [item, ...history].slice(0, 12)
      setHistory(next)
      localStorage.setItem('dia-history', JSON.stringify(next))
      if (window.matchMedia('(max-width: 899px)').matches) {
        requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
      }
    } catch (e) {
      if (e instanceof TypeError) setServerDown(true)
      else setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const restore = item => {
    if (!item.inputs) return
    setForm(item.inputs)
    setResult(null)
    setPage('predict')
  }

  const clearHistory = () => { setHistory([]); localStorage.removeItem('dia-history') }

  const stats = analytics
    ? Object.fromEntries(FIELDS.map(f => [f.key, {
        min: analytics.feature_ranges?.[f.feature]?.min,
        max: analytics.feature_ranges?.[f.feature]?.max,
        avg: analytics.averages?.[f.feature]
      }]))
    : {}

  const tabs = [['predict', 'Predict'], ['model', 'Model'], ['history', 'History']]

  return (
    <>
      <header className="top">
        <div className="wrap top-inner">
          <div className="brand"><Droplet size={20} strokeWidth={2.4} />DiaPredict</div>
          <nav className="tabs" aria-label="Sections">
            {tabs.map(([id, label]) => (
              <button
                key={id} type="button"
                className={page === id ? 'tab on' : 'tab'}
                aria-current={page === id ? 'page' : undefined}
                onClick={() => setPage(id)}
              >{label}{id === 'history' && history.length > 0 ? <span className="count">{history.length}</span> : null}</button>
            ))}
          </nav>
          <button type="button" className="icon-btn" onClick={() => setDark(!dark)}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className="wrap">
        {serverDown && (
          <div className="banner" role="alert">
            <AlertTriangle size={18} />
            <p>
              The model server isn't responding. In the <code>backend</code> folder, run{' '}
              <code>python -m uvicorn main:app --reload</code>, then retry.
            </p>
            <button type="button" className="btn-line" onClick={loadAnalytics}>Retry</button>
          </div>
        )}

        {page === 'predict' && (
          <div className="work">
            <form id="patient-form" className="inputs" onSubmit={predict} noValidate>
              <h1>Patient values</h1>
              <p className="lede">
                Type a number or drag a slider. The tick on each slider marks the average of the{' '}
                {analytics ? analytics.dataset.rows : 'training'} patients the model learned from.
              </p>
              {GROUPS.map(group => (
                <fieldset key={group.id} className="group">
                  <legend>{group.title}</legend>
                  <div className="field-grid">
                    {FIELDS.filter(f => f.group === group.id).map(f => (
                      <Field key={f.key} field={f} value={form[f.key]} stats={stats[f.key]} onChange={v => update(f.key, v)} />
                    ))}
                  </div>
                </fieldset>
              ))}
            </form>

            <aside className="side" aria-label="Prediction">
              <div className="side-inner">
                <button type="submit" form="patient-form" className="btn-primary" disabled={loading || !allValid}>
                  {loading ? <><RefreshCw size={18} className="spin" />Running model…</> : 'Run prediction'}
                </button>
                <button type="button" className="btn-quiet" onClick={reset}><RotateCcw size={15} />Reset to sample values</button>
                {!allValid && <p className="hint">Enter all eight values (0 or higher) to run the model.</p>}

                <div ref={resultRef} className="result-slot" aria-live="polite">
                  <Result result={result} stale={stale} error={error} />
                </div>

                {analytics && (
                  <dl className="facts">
                    <div><dt>Model</dt><dd>Linear SVM</dd></div>
                    <div><dt>Accuracy on test split</dt><dd>{pct(analytics.metrics.accuracy)}</dd></div>
                    <div><dt>Training records</dt><dd>{analytics.dataset.rows}</dd></div>
                  </dl>
                )}
                {analytics && <button type="button" className="btn-quiet link" onClick={() => setPage('model')}>See how the model performs</button>}
              </div>
            </aside>
          </div>
        )}

        {page === 'model' && <ModelPage analytics={analytics} onRetry={loadAnalytics} colors={CHART_COLORS[dark ? 'dark' : 'light']} />}
        {page === 'history' && <HistoryPage history={history} onClear={clearHistory} onRestore={restore} onGoPredict={() => setPage('predict')} />}

        <p className="disclaimer">
          Educational project. The model is not a medical device, and its output is not a diagnosis.
        </p>
      </main>
    </>
  )
}

/* ---------- Predict page pieces ---------- */

function Field({ field, value, stats, onChange }) {
  const id = `f-${field.key}`
  const lo = stats?.min ?? 0
  const hi = stats?.max ?? field.fallbackMax
  const avg = stats?.avg
  const valid = isValid(value)
  const num = valid ? Number(value) : 0
  const span = hi - lo || 1
  const at = clamp(((num - lo) / span) * 100, 0, 100)
  const avgAt = avg == null ? null : clamp(((avg - lo) / span) * 100, 0, 100)
  // The native thumb is 18px wide, so its travel is inset by 9px at each end.
  const thumbLeft = p => `calc(${p}% + ${(9 - 0.18 * p).toFixed(2)}px)`

  let note = ''
  let tone = ''
  if (!valid) { note = 'Enter a number, 0 or higher'; tone = 'bad' }
  else if (num === 0 && field.zeroIsMissing) note = 'In this dataset, 0 often stands for a missing reading'
  else if (num < lo || num > hi) note = 'Outside the range in the dataset'
  else if (avg != null) {
    const d = num - avg
    note = Math.abs(d) < span * 0.02
      ? 'Close to the dataset average'
      : `${fmt(Math.abs(d))} ${d > 0 ? 'above' : 'below'} average (${fmt(avg)})`
  }

  return (
    <div className="field">
      <div className="field-top">
        <label htmlFor={id}>{field.label}</label>
        <span className="num">
          <input
            id={id} type="number" inputMode="decimal" min="0" step="any" value={value}
            aria-invalid={!valid} aria-describedby={`${id}-note`}
            onChange={e => onChange(e.target.value)}
          />
          <span className="unit">{field.unit}</span>
        </span>
      </div>
      <div className="slider" style={{ '--fill': `${at}%` }}>
        <input
          type="range" aria-label={`${field.label} slider`} min={lo} max={hi} step={field.slider}
          value={clamp(num, lo, hi)} onChange={e => onChange(e.target.value)}
        />
        {avgAt != null && <span className="avg-tick" style={{ left: thumbLeft(avgAt) }} aria-hidden="true" />}
      </div>
      <div className="field-foot">
        <span>{fmt(lo)}</span>
        <span id={`${id}-note`} className={tone === 'bad' ? 'note bad' : 'note'}>{note}</span>
        <span>{fmt(hi)}</span>
      </div>
    </div>
  )
}

function Result({ result, stale, error }) {
  if (error) {
    return (
      <div className="result bad" role="alert">
        <h2><AlertTriangle size={22} />Prediction failed</h2>
        <p>{error}</p>
      </div>
    )
  }
  if (!result) {
    return (
      <div className="result idle">
        <h2>No result yet</h2>
        <p>Run the model to see its prediction for the values on the left.</p>
      </div>
    )
  }
  const positive = result.prediction === 1
  return (
    <div key={result.at} className={`result ${positive ? 'risk' : 'ok'}${stale ? ' stale' : ''}`}>
      <h2>{positive ? <Activity size={24} /> : <CheckCircle2 size={24} />}{positive ? 'Predicted diabetic' : 'Predicted not diabetic'}</h2>
      <p>{result.message}</p>
      {stale && (
        <p className="stale-note"><AlertTriangle size={15} />Values have changed since this run. Run the model again to update.</p>
      )}
      <p className="caveat">
        The model returns a class label (outcome {result.prediction}), not a probability.
      </p>
    </div>
  )
}

/* ---------- Model page ---------- */

function Unavailable({ onRetry, title }) {
  return (
    <section className="empty">
      <h1>{title}</h1>
      <p>This page needs the backend. Start it from the <code>backend</code> folder, and make sure <code>diabetes_dataset.csv</code> is in there.</p>
      <button type="button" className="btn-line" onClick={onRetry}>Retry connection</button>
    </section>
  )
}

function ModelPage({ analytics, onRetry, colors }) {
  const coefficients = useMemo(() => {
    if (!analytics) return []
    return Object.entries(analytics.coefficients)
      .map(([k, v]) => ({ name: FEATURE_LABEL[k] || k, value: Number(v.toFixed(3)) }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  }, [analytics])

  if (!analytics) return <Unavailable onRetry={onRetry} title="Model details are unavailable" />

  const { metrics, confusion_matrix: cm, dataset } = analytics
  const measures = [
    ['Accuracy', metrics.accuracy, 'Share of test patients the model classified correctly.'],
    ['Precision', metrics.precision, 'When the model says diabetic, how often it is right.'],
    ['Recall', metrics.recall, 'Of the patients who are diabetic, how many the model catches.'],
    ['F1 score', metrics.f1, 'A single score that balances precision and recall.']
  ]
  const cmMax = Math.max(cm.tn, cm.fp, cm.fn, cm.tp, 1)
  const shade = (n, good) => `color-mix(in srgb, var(${good ? '--ok' : '--risk'}) ${Math.round(14 + (n / cmMax) * 46)}%, var(--surface))`
  const diabeticShare = dataset.diabetic / dataset.rows

  return (
    <div className="model">
      <h1>How the model performs</h1>
      <p className="lede">
        Scores come from a held-out 20% of the dataset, split so both outcomes appear in the same proportion as the whole.
        Inputs are standardized before the Linear SVM sees them.
      </p>

      <section className="block">
        <h2>Scores on the test split</h2>
        <ul className="measures">
          {measures.map(([name, value, why]) => (
            <li key={name}>
              <div className="m-name">{name}</div>
              <div className="m-bar" role="img" aria-label={`${name} ${pct(value)}`}><i style={{ width: `${value * 100}%` }} /></div>
              <div className="m-val">{pct(value)}</div>
              <p>{why}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="two">
        <section className="block">
          <h2>Where the model was right and wrong</h2>
          <div className="cm">
            <span />
            <span className="cm-h">Predicted not diabetic</span>
            <span className="cm-h">Predicted diabetic</span>
            <span className="cm-h side-h">Actually not diabetic</span>
            <div className="cm-cell" style={{ background: shade(cm.tn, true) }}><b>{cm.tn}</b><small>Correctly cleared</small></div>
            <div className="cm-cell" style={{ background: shade(cm.fp, false) }}><b>{cm.fp}</b><small>Flagged by mistake</small></div>
            <span className="cm-h side-h">Actually diabetic</span>
            <div className="cm-cell" style={{ background: shade(cm.fn, false) }}><b>{cm.fn}</b><small>Missed</small></div>
            <div className="cm-cell" style={{ background: shade(cm.tp, true) }}><b>{cm.tp}</b><small>Correctly flagged</small></div>
          </div>
        </section>

        <section className="block">
          <h2>What the training data looks like</h2>
          <p className="sub">{dataset.rows} records, {dataset.features} inputs each.</p>
          <div className="split" role="img" aria-label={`${dataset.non_diabetic} not diabetic, ${dataset.diabetic} diabetic`}>
            <i className="split-ok" style={{ width: `${(1 - diabeticShare) * 100}%` }} />
            <i className="split-risk" style={{ width: `${diabeticShare * 100}%` }} />
          </div>
          <div className="split-key">
            <span><i className="key ok" />Not diabetic <b>{dataset.non_diabetic}</b></span>
            <span><i className="key risk" />Diabetic <b>{dataset.diabetic}</b></span>
          </div>
        </section>
      </div>

      <section className="block">
        <h2>Which inputs push the prediction</h2>
        <p className="sub">
          Bars to the right push toward "diabetic", bars to the left toward "not diabetic". Inputs are standardized, so bar lengths are comparable.
        </p>
        <ResponsiveContainer width="100%" height={coefficients.length * 38 + 30}>
          <BarChart data={coefficients} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fill: colors.text, fontSize: 12 }} stroke={colors.grid} />
            <YAxis type="category" dataKey="name" width={118} tick={{ fill: colors.ink, fontSize: 13 }} stroke={colors.grid} />
            <ReferenceLine x={0} stroke={colors.text} />
            <Tooltip cursor={{ fill: colors.grid, opacity: 0.35 }}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)' }} />
            <Bar dataKey="value" name="Coefficient" radius={3}>
              {coefficients.map(c => <Cell key={c.name} fill={c.value >= 0 ? colors.risk : colors.ok} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  )
}

/* ---------- History page ---------- */

function HistoryPage({ history, onClear, onRestore, onGoPredict }) {
  if (history.length === 0) {
    return (
      <section className="empty">
        <h1>No predictions yet</h1>
        <p>Each time you run the model, the values and result are saved here, in this browser only.</p>
        <button type="button" className="btn-line" onClick={onGoPredict}>Go to Predict</button>
      </section>
    )
  }
  return (
    <section className="history">
      <div className="history-head">
        <div>
          <h1>Recent predictions</h1>
          <p className="lede">The last {history.length} runs, stored in this browser.</p>
        </div>
        <button type="button" className="btn-line" onClick={onClear}><Trash2 size={15} />Clear history</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Run at</th><th className="r">Glucose</th><th className="r">BMI</th><th className="r">Age</th><th>Result</th><th><span className="sr">Actions</span></th></tr>
          </thead>
          <tbody>
            {history.map(item => (
              <tr key={item.id}>
                <td>{item.date}</td>
                <td className="r">{item.glucose}</td>
                <td className="r">{item.bmi}</td>
                <td className="r">{item.age}</td>
                <td><span className={item.prediction ? 'pill risk' : 'pill ok'}>{item.prediction ? 'Diabetic' : 'Not diabetic'}</span></td>
                <td className="r">{item.inputs && <button type="button" className="btn-quiet link" onClick={() => onRestore(item)}>Load values</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
