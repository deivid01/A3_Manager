# A3 Manager

Sistema desktop para gerenciamento de locações de equipamentos da **A3 Locação de Equipamentos para Construção**.

O A3 Manager foi desenvolvido para centralizar o cadastro de clientes e equipamentos, lançamento e acompanhamento de locações, controle de estoque, relatórios, documentos de locação e administração de usuários em uma aplicação desktop para Windows.

O sistema foi projetado para continuar operacional mesmo sem conexão com a rede, utilizando banco de dados local e sincronização de dados quando o servidor estiver disponível.

---

## Funcionalidades

### Locações

- Cadastro e lançamento de novas locações.
- Busca de clientes e equipamentos.
- Controle de quantidade por item.
- Controle automático de estoque.
- Períodos de locação:
  - Diária
  - Semanal
  - Quinzenal
  - Mensal
- Preço específico de cada equipamento para cada período.
- Cálculo automático do total da locação.
- Valor de indenização armazenado separadamente do valor da locação.
- Registro do usuário responsável pelo lançamento.
- Código único para cada locação.
- Endereço de entrega e responsável pelo recebimento.
- Diferentes formas de pagamento.
- Finalização de locações com devolução automática das quantidades ao estoque.

### Equipamentos

- Cadastro e edição de equipamentos.
- Estoque disponível.
- Valor de locação por período.
- Valor unitário de indenização.
- Catálogo inicial dos principais equipamentos da empresa.
- Pesquisa rápida de equipamentos durante uma locação.

### Clientes

Cadastro completo de clientes com:

- Nome.
- CPF.
- RG.
- Telefone / contato.
- CEP.
- Endereço.
- Bairro.
- Número.
- Cidade.
- Estado.

### Relatórios

- Consulta de locações em andamento e finalizadas.
- Filtros de pesquisa.
- Paginação.
- Visualização detalhada da locação.
- Arquivamento e desarquivamento de registros.
- Geração de documentos em PDF.
- Impressão direta do documento de locação.
- Preservação dos dados históricos da locação mesmo após alterações posteriores em clientes ou equipamentos.

### Documentos

O sistema gera documentos de locação contendo:

- Dados da empresa.
- Dados do cliente.
- Equipamentos locados.
- Quantidades.
- Período contratado.
- Valores unitários da locação.
- Subtotais.
- Total da locação.
- Valores de indenização por item.
- Termo de responsabilidade.
- Campos para assinatura.

Os documentos históricos utilizam snapshots dos dados existentes no momento da contratação, evitando que alterações futuras modifiquem contratos antigos.

### Usuários e permissões

O A3 Manager possui controle de acesso por perfil.

**Administrador**

- Acesso completo ao sistema.
- Gerenciamento de usuários.
- Cadastro e edição de usuários.
- Alteração de perfil.
- Ativação e desativação de contas.
- Redefinição de senha.
- Configurações administrativas.
- Configuração de sincronização.

**Usuário**

- Clientes.
- Equipamentos.
- Locações.
- Relatórios.
- Operações normais do sistema.

Usuários comuns não possuem acesso ao gerenciamento de usuários nem às configurações sensíveis de sincronização.

---

## Offline e sincronização

O A3 Manager utiliza uma arquitetura com **banco local operacional**.

A aplicação continua permitindo operações essenciais mesmo quando o servidor de sincronização não está disponível.

Quando a conexão é restabelecida, as alterações pendentes podem ser sincronizadas com o servidor remoto.

Características principais:

- SQLite local.
- Operação offline.
- Fila local de alterações pendentes.
- Sincronização remota.
- Proteção contra sobrescrita de alterações locais ainda não sincronizadas.
- Configuração segura de credenciais de conexão.
- Status de sincronização exibido na aplicação.

> Credenciais, tokens e outras informações sensíveis de infraestrutura não devem ser adicionadas ao repositório.

---

## Tecnologias

O projeto utiliza principalmente:

- **TypeScript**
- **Electron**
- **React**
- **SQLite / sql.js**
- **Vite**
- **Tailwind CSS**
- **shadcn/ui**
- **Radix UI**
- **Lucide React**
- **Vitest**
- **electron-builder**

---

## Requisitos

### Desenvolvimento

- Node.js
- npm
- Windows 10 ou superior

O projeto é desenvolvido e distribuído principalmente para ambiente Windows.

---

## Instalação das dependências

No Windows:

```powershell
npm.cmd install
```

---

## Desenvolvimento

Para utilizar os scripts disponíveis no projeto, consulte também o `package.json`.

### Testes

```powershell
npm.cmd test
```

### Verificação de tipos

```powershell
npm.cmd run typecheck
```

### Lint

```powershell
npm.cmd run lint
```

### Build

```powershell
npm.cmd run build
```

### Gerar executáveis Windows

```powershell
npm.cmd run dist
```

O processo de distribuição gera os artefatos Windows configurados pelo `electron-builder`, incluindo versões de instalação e portátil.

---

## Validações auxiliares

### Validação visual

```powershell
npm.cmd run validate:ui
```

Utilizado para capturas e verificações responsivas do aplicativo empacotado.

### Medição de memória

```powershell
npm.cmd run measure:memory
```

Utilizado para medir o consumo de memória dos processos da aplicação após o período definido pelo script.

---

## Banco de dados

O banco de dados local é criado automaticamente no diretório de dados do usuário utilizado pelo Electron.

Em uma instalação normal do Windows, os dados ficam fora da pasta de instalação do programa.

Isso permite atualizar ou reinstalar o executável sem depender dos arquivos presentes dentro de `Program Files`.

O banco local contém, entre outros:

- Usuários.
- Configurações da empresa.
- Clientes.
- Equipamentos.
- Estoque.
- Locações.
- Itens das locações.
- Snapshots históricos.
- Estado de arquivamento.
- Controle de sincronização.

As alterações de estrutura são realizadas através das migrações versionadas do projeto.

---

## Segurança

Algumas regras adotadas pelo projeto:

- Senhas são armazenadas utilizando hash.
- Senhas atuais nunca são retornadas ao renderer.
- Credenciais sensíveis de sincronização não devem ser armazenadas no código-fonte.
- Tokens não devem ser versionados no Git.
- Operações administrativas possuem validação de permissão também no backend/IPC.
- O renderer não possui acesso arbitrário ao banco de dados.
- Consultas e alterações utilizam contratos e operações controladas.
- Dados históricos de contratos não dependem diretamente dos cadastros atuais.

---

## Estrutura geral

```text
src/
├── application/        # Casos de uso e serviços da aplicação
├── domain/             # Regras e tipos de domínio
├── infrastructure/     # Banco, sincronização, impressão e logging
├── main/               # Processo principal do Electron
├── preload/            # Bridge segura entre renderer e main
├── renderer/           # Interface React
├── shared/             # Contratos compartilhados
└── tools/              # Ferramentas auxiliares de validação

tests/
└── Testes automatizados

release/
└── Artefatos gerados para Windows
```

---

## Dados sensíveis

Nunca envie para o GitHub:

```text
.env
tokens
senhas
credenciais de servidor
bancos de produção
backups reais
arquivos de configuração contendo segredos
```

Utilize arquivos de exemplo, como `.env.example`, somente com valores fictícios.

---

## Desenvolvimento

Desenvolvido por **Deivid Peres**.

GitHub: [@deivid01](https://github.com/deivid01)

---

## Projeto

**A3 Manager**  
Sistema de gestão desenvolvido para a **A3 Locação de Equipamentos para Construção**.