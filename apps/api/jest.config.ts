import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleFileExtensions: ['ts', 'js'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  verbose: true
};

export default config;


