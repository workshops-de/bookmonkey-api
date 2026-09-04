/**
 * NestJS 12 wird als pure ESM ausgeliefert. Jest läuft deshalb im ESM-Modus
 * (`NODE_OPTIONS=--experimental-vm-modules`, gesetzt in den package.json-Scripts)
 * und ts-jest transpiliert unsere Quellen ebenfalls nach ESM.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true,
        tsconfig: {
          module: 'ES2022',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          target: 'ES2022',
          verbatimModuleSyntax: false,
        },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};
