import vine from '@vinejs/vine'

const createAccountValidator = vine.object({
  username: vine.string(),
  email: vine.string().email(),
  password: vine
    .string()
    .minLength(8)
    .maxLength(32)
    .confirmed()
})

const data = {
  username: 'virk',
  email: 'virk@example.com',
  password: 'secret',
  password_confirmation: 'secret',
}

const validator = vine.create(createAccountValidator)
const output = await validator.validate(data)
