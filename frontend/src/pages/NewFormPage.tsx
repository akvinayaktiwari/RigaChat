import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, GripVertical, Loader2, Plus, Trash2, X } from 'lucide-react'
import { createForm } from '../services/api'
import { Toggle } from '../components/Toggle'
import type { FormField } from '../types/index'

type FieldType = FormField['type']

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'options', label: 'Options' },
]

interface FormFieldDraft {
  tempId: string
  label: string
  type: FieldType
  required: boolean
  placeholder: string
  options: string[]
  newOptionInput: string
}

function makeTempId(): string {
  return Math.random().toString(36).slice(2)
}

function makeEmptyField(): FormFieldDraft {
  return {
    tempId: makeTempId(),
    label: '',
    type: 'text',
    required: false,
    placeholder: '',
    options: [],
    newOptionInput: '',
  }
}

const inputClasses =
  'w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all'
const labelClasses = 'block text-sm font-medium text-slate-700 mb-2'

export default function NewFormPage() {
  const navigate = useNavigate()
  const [formName, setFormName] = useState('')
  const [description, setDescription] = useState('')
  const [submitButtonText, setSubmitButtonText] = useState('Submit')
  const [fields, setFields] = useState<FormFieldDraft[]>([makeEmptyField()])
  const [nameError, setNameError] = useState<string | null>(null)
  const [fieldsError, setFieldsError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function updateField<K extends keyof FormFieldDraft>(tempId: string, key: K, value: FormFieldDraft[K]) {
    setFields((prev) => prev.map((f) => (f.tempId === tempId ? { ...f, [key]: value } : f)))
  }

  function addField() {
    setFields((prev) => [...prev, makeEmptyField()])
  }

  function removeField(tempId: string) {
    setFields((prev) => prev.filter((f) => f.tempId !== tempId))
  }

  function addOption(tempId: string) {
    setFields((prev) =>
      prev.map((f) => {
        if (f.tempId !== tempId) return f
        const value = f.newOptionInput.trim()
        if (!value) return f
        return { ...f, options: [...f.options, value], newOptionInput: '' }
      })
    )
  }

  function removeOption(tempId: string, option: string) {
    setFields((prev) =>
      prev.map((f) => (f.tempId === tempId ? { ...f, options: f.options.filter((o) => o !== option) } : f))
    )
  }

  async function handleSave() {
    setNameError(null)
    setFieldsError(null)
    setSaveError(null)

    let hasError = false
    if (!formName.trim()) {
      setNameError('Form name is required')
      hasError = true
    }
    if (fields.length === 0) {
      setFieldsError('Add at least one field')
      hasError = true
    }
    if (hasError) return

    setSaving(true)
    try {
      const res = await createForm({
        name: formName.trim(),
        description: description.trim() || undefined,
        submitButtonText: submitButtonText.trim() || 'Submit',
        fields: fields.map((f) => ({
          label: f.label,
          type: f.type,
          required: f.required,
          placeholder: f.placeholder || undefined,
          options: f.type === 'options' ? f.options : undefined,
        })),
      })

      if (res.success) {
        navigate('/dashboard/forms')
      } else {
        setSaveError(res.error ?? 'Failed to create form')
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to create form')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate('/dashboard/forms')}
          title="Back to Forms"
          className="text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-bold text-2xl text-slate-800">Create New Form</h1>
          <p className="text-sm text-slate-500">Design your lead capture form</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="font-semibold text-lg text-slate-800 mb-4">Form Details</h2>

            <div className="space-y-4">
              <div>
                <label className={labelClasses}>Form Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Get a Quote"
                  className={inputClasses}
                />
                {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
              </div>

              <div>
                <label className={labelClasses}>Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell visitors why they should fill this form"
                  className={inputClasses}
                />
              </div>

              <div>
                <label className={labelClasses}>Submit Button Text</label>
                <input
                  type="text"
                  value={submitButtonText}
                  onChange={(e) => setSubmitButtonText(e.target.value)}
                  placeholder="Submit"
                  className={inputClasses}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">Form Fields</h2>
              <button
                type="button"
                onClick={addField}
                className="border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors flex items-center gap-1"
              >
                <Plus size={14} />
                Add Field
              </button>
            </div>

            <div className="space-y-3">
              {fields.map((field) => (
                <div key={field.tempId} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-start gap-3">
                    <GripVertical size={16} className="text-slate-300 mt-3 shrink-0" />

                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => updateField(field.tempId, 'label', e.target.value)}
                          placeholder='Field label, e.g. "Full Name"'
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                        />
                        <select
                          value={field.type}
                          onChange={(e) => updateField(field.tempId, 'type', e.target.value as FieldType)}
                          className="w-40 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {FIELD_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {field.type === 'options' && (
                        <div>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {field.options.map((option) => (
                              <span
                                key={option}
                                className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full flex items-center gap-1"
                              >
                                {option}
                                <button
                                  type="button"
                                  onClick={() => removeOption(field.tempId, option)}
                                  className="hover:text-indigo-900"
                                  title={`Remove ${option}`}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={field.newOptionInput}
                              onChange={(e) => updateField(field.tempId, 'newOptionInput', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  addOption(field.tempId)
                                }
                              }}
                              placeholder="Add an option"
                              className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => addOption(field.tempId)}
                              className="text-sm border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <Toggle
                          checked={field.required}
                          onChange={(checked) => updateField(field.tempId, 'required', checked)}
                          onLabel="Required"
                          offLabel="Optional"
                          title="Toggle required"
                        />

                        <button
                          type="button"
                          onClick={() => removeField(field.tempId)}
                          title="Delete field"
                          className="text-red-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {fieldsError && <p className="text-xs text-red-500 mt-3">{fieldsError}</p>}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="font-semibold text-slate-800">Live Preview</h2>
            <p className="text-sm text-slate-500 mb-4">This is how your form will look</p>

            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
              <p className="font-bold text-slate-800 mb-1">{formName || 'Untitled Form'}</p>
              {description && <p className="text-slate-500 text-sm mb-4">{description}</p>}

              <div className="space-y-3">
                {fields.map((field) => (
                  <div key={field.tempId}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {field.label || 'Untitled field'}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {field.type === 'options' ? (
                      <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" disabled>
                        <option>Select an option</option>
                        {field.options.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder={field.placeholder}
                        disabled
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled
                className="bg-indigo-600 text-white w-full py-2 rounded-xl mt-4 text-sm font-medium"
              >
                {submitButtonText || 'Submit'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? 'Creating...' : 'Create Form'}
        </button>
        {saveError && <p className="text-sm text-red-500">{saveError}</p>}
      </div>
    </div>
  )
}
