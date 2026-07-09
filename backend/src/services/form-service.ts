import { v4 as uuidv4 } from 'uuid'
import {
  createForm,
  deleteForm,
  getFormById,
  getFormsByClientId,
  getPublicFormConfig,
  updateForm,
} from '../repositories/form-repository.js'
import type { CreateFormInput, FormConfig, FormField } from '../types/index.js'

export async function createNewForm(input: CreateFormInput): Promise<FormConfig> {
  if (input.fields.length === 0) {
    throw new Error('Form must have at least one field')
  }

  const fieldsWithIds: FormField[] = input.fields.map((field) => ({ ...field, fieldId: uuidv4() }))

  return createForm({
    clientId: input.clientId,
    name: input.name,
    description: input.description,
    submitButtonText: input.submitButtonText || 'Submit',
    fields: fieldsWithIds,
  })
}

export async function getClientForms(clientId: string): Promise<FormConfig[]> {
  return getFormsByClientId(clientId)
}

export async function getFormConfig(formId: string, clientId: string): Promise<FormConfig> {
  const form = await getFormById(formId, clientId)
  if (!form) {
    throw new Error('Form not found')
  }
  return form
}

export async function getPublicConfig(formId: string): Promise<FormConfig> {
  const form = await getPublicFormConfig(formId)
  if (!form) {
    throw new Error('Form not found')
  }
  return form
}

export async function updateFormConfig(
  formId: string,
  clientId: string,
  updates: Partial<Omit<FormConfig, 'formId' | 'clientId' | 'createdAt'>>
): Promise<FormConfig> {
  const nextUpdates = { ...updates }

  if (nextUpdates.fields) {
    nextUpdates.fields = nextUpdates.fields.map((field) => ({
      ...field,
      fieldId: field.fieldId || uuidv4(),
    }))
  }

  return updateForm(formId, clientId, nextUpdates)
}

export async function removeForm(formId: string, clientId: string): Promise<void> {
  const form = await getFormById(formId, clientId)
  if (!form) {
    throw new Error('Form not found')
  }
  await deleteForm(formId, clientId)
}
