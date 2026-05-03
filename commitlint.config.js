/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Mensajes de commit en español están permitidos en el subject
    'subject-case': [0],
  },
};
