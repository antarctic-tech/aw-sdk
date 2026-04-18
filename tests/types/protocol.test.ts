import { describe, it, expect } from 'vitest';
import {
  AWCommand,
  COMMAND_VERSIONS,
  PROTOCOL_VERSION,
  validateSupportedCommands,
  isCommandAvailable,
} from '../../src/types/protocol';

describe('protocol', () => {
  describe('PROTOCOL_VERSION', () => {
    it('равна "1.0"', () => {
      expect(PROTOCOL_VERSION).toBe('1.0');
    });
  });

  describe('COMMAND_VERSIONS', () => {
    it('содержит все команды из AWCommand', () => {
      const commands = Object.values(AWCommand);
      for (const cmd of commands) {
        expect(COMMAND_VERSIONS[cmd]).toBeTypeOf('number');
      }
    });
  });

  describe('validateSupportedCommands', () => {
    it('возвращает true если supported = undefined', () => {
      expect(validateSupportedCommands(undefined)).toBe(true);
    });

    it('возвращает true если все команды поддерживаются', () => {
      const supported: Record<string, number> = {};
      for (const cmd of Object.values(AWCommand)) {
        supported[cmd] = 1;
      }
      expect(validateSupportedCommands(supported)).toBe(true);
    });

    it('возвращает true если версии выше требуемых', () => {
      const supported: Record<string, number> = {};
      for (const cmd of Object.values(AWCommand)) {
        supported[cmd] = 99;
      }
      expect(validateSupportedCommands(supported)).toBe(true);
    });

    it('возвращает false если команда отсутствует в supported', () => {
      expect(validateSupportedCommands({})).toBe(false);
    });

    it('возвращает false если версия ниже требуемой', () => {
      const supported: Record<string, number> = {};
      for (const cmd of Object.values(AWCommand)) {
        supported[cmd] = 1;
      }
      supported[AWCommand.Init] = 0;
      expect(validateSupportedCommands(supported)).toBe(false);
    });
  });

  describe('isCommandAvailable', () => {
    it('возвращает true если версия достаточна', () => {
      const supported = { [AWCommand.Init]: 1 };
      expect(isCommandAvailable(AWCommand.Init, supported)).toBe(true);
    });

    it('возвращает true если версия выше', () => {
      const supported = { [AWCommand.Init]: 5 };
      expect(isCommandAvailable(AWCommand.Init, supported)).toBe(true);
    });

    it('возвращает false если команды нет', () => {
      expect(isCommandAvailable(AWCommand.Init, {})).toBe(false);
    });

    it('возвращает false если версия = 0', () => {
      const supported = { [AWCommand.Init]: 0 };
      expect(isCommandAvailable(AWCommand.Init, supported)).toBe(false);
    });
  });
});
