export type DefaultPatternSeed = {
  key: string;
  name: string;
  pattern: string;
  description: string;
  enabled: boolean;
  fields: string[];
};

export const DEFAULT_PATTERN_SEEDS: DefaultPatternSeed[] = [
  {
    key: 'base',
    name: 'Base Log Pattern',
    pattern:
      '^(?<ts>\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d+\\+\\d{2}:\\d{2})\\s+(?<host>\\S+)\\s+(?<program>[^:]+):\\s+(?<message>.*)$',
    description: 'Base pattern for all log lines',
    enabled: true,
    fields: ['ts', 'host', 'program', 'message'],
  },
  {
    key: 'postfix',
    name: 'Postfix Component',
    pattern: '(?<component>postfix\\/[a-z]+)\\[(?<pid>\\d+)\\]:\\s+(?<detail>.*)',
    description: 'Extracts postfix component and process ID',
    enabled: true,
    fields: ['component', 'pid', 'detail'],
  },
  {
    key: 'queue_id',
    name: 'Queue ID',
    pattern: '(?<queue_id>[A-F0-9]{5,11}):',
    description: 'Extracts postfix queue ID',
    enabled: true,
    fields: ['queue_id'],
  },
  {
    key: 'status',
    name: 'Email Status',
    pattern: 'status=(?<status>[a-z]+)',
    description: 'Extracts email delivery status',
    enabled: true,
    fields: ['status'],
  },
  {
    key: 'message_id',
    name: 'Message ID',
    pattern: 'message-id=(?<message_id><[^>]+>)',
    description: 'Extracts email message ID',
    enabled: true,
    fields: ['message_id'],
  },
  {
    key: 'from',
    name: 'From Address',
    pattern: 'from=(?<from><[^>]*>)',
    description: 'Extracts sender email address',
    enabled: true,
    fields: ['from'],
  },
  {
    key: 'to',
    name: 'To Address',
    pattern: 'to=(?<to><[^>]*>)',
    description: 'Extracts recipient email address',
    enabled: true,
    fields: ['to'],
  },
  {
    key: 'client',
    name: 'Client',
    pattern: 'client=(?<client>[^,\\s]+)',
    description: 'Extracts client information',
    enabled: true,
    fields: ['client'],
  },
  {
    key: 'sasl_username',
    name: 'SASL Username',
    pattern: 'sasl_username=(?<sasl_username>[^,\\s]+)',
    description: 'Extracts SASL authentication username',
    enabled: true,
    fields: ['sasl_username'],
  },
  {
    key: 'ip_address',
    name: 'IP Address',
    pattern: '(?<ip>\\d{1,3}(?:\\.\\d{1,3}){3})',
    description: 'Extracts IP addresses',
    enabled: true,
    fields: ['ip'],
  },
  {
    key: 'dovecot_auth',
    name: 'Dovecot Auth',
    pattern: 'auth:\\s+(?<level>Debug|Info|Warning|Error):\\s+(?<detail>.*)',
    description: 'Extracts Dovecot authentication logs',
    enabled: true,
    fields: ['level', 'detail'],
  },
];
