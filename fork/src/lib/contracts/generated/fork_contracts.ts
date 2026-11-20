/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/fork_contracts.json`.
 */
export type ForkContracts = {
  "address": "2Hfano51aQbCLFE5mf348CXRb4YEzpnqvow7ucCV6Lyv",
  "metadata": {
    "name": "forkContracts",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Escrowed binary conditional LMSR prediction market"
  },
  "instructions": [
    {
      "name": "acceptAdmin",
      "discriminator": [
        112,
        42,
        45,
        90,
        116,
        181,
        13,
        170
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          },
          "relations": [
            "parent",
            "target"
          ]
        },
        {
          "name": "parent"
        },
        {
          "name": "target"
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "parent"
              },
              {
                "kind": "account",
                "path": "target"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "b",
          "type": "u64"
        },
        {
          "name": "initialLogOddsE6",
          "type": "i64"
        }
      ]
    },
    {
      "name": "createMarketForBudget",
      "docs": [
        "Size depth from a funding budget before anyone contributes. Both depth",
        "and starting probability remain immutable, including throughout Funding."
      ],
      "discriminator": [
        107,
        26,
        205,
        189,
        196,
        35,
        235,
        254
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          },
          "relations": [
            "parent",
            "target"
          ]
        },
        {
          "name": "parent"
        },
        {
          "name": "target"
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "parent"
              },
              {
                "kind": "account",
                "path": "target"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "budget",
          "type": "u64"
        },
        {
          "name": "initialLogOddsE6",
          "type": "i64"
        }
      ]
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "trader"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          },
          "relations": [
            "market",
            "parent",
            "target"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "parent"
              },
              {
                "kind": "account",
                "path": "target"
              }
            ]
          },
          "relations": [
            "trader"
          ]
        },
        {
          "name": "parent",
          "relations": [
            "market"
          ]
        },
        {
          "name": "target",
          "relations": [
            "market"
          ]
        },
        {
          "name": "trader",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "fundLp",
      "discriminator": [
        171,
        16,
        234,
        196,
        110,
        204,
        243,
        168
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "lp"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          },
          "relations": [
            "market",
            "parent",
            "target"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "parent"
              },
              {
                "kind": "account",
                "path": "target"
              }
            ]
          },
          "relations": [
            "lp"
          ]
        },
        {
          "name": "parent",
          "relations": [
            "market"
          ]
        },
        {
          "name": "target",
          "relations": [
            "market"
          ]
        },
        {
          "name": "lp",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "reporter",
          "type": "pubkey"
        },
        {
          "name": "pauseAuthority",
          "type": "pubkey"
        },
        {
          "name": "maxTrade",
          "type": "u64"
        },
        {
          "name": "maxDeposits",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeSolConfig",
      "discriminator": [
        170,
        91,
        73,
        211,
        167,
        222,
        122,
        196
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  45,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              }
            ]
          }
        },
        {
          "name": "mint",
          "address": "So11111111111111111111111111111111111111112"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "reporter",
          "type": "pubkey"
        },
        {
          "name": "pauseAuthority",
          "type": "pubkey"
        },
        {
          "name": "maxTrade",
          "type": "u64"
        },
        {
          "name": "maxDeposits",
          "type": "u64"
        }
      ]
    },
    {
      "name": "migrateMarket",
      "docs": [
        "Permissionless, idempotent rent top-up. Existing economics never change."
      ],
      "discriminator": [
        201,
        113,
        181,
        120,
        217,
        60,
        109,
        203
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "docs": [
            "market PDA checked in the handler before any resize or write."
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "openLp",
      "discriminator": [
        30,
        136,
        221,
        185,
        89,
        232,
        159,
        60
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market"
        },
        {
          "name": "lp",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "openTrader",
      "discriminator": [
        223,
        155,
        155,
        23,
        151,
        167,
        170,
        229
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market"
        },
        {
          "name": "trader",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "proposeAdmin",
      "discriminator": [
        121,
        214,
        199,
        212,
        87,
        39,
        117,
        234
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "next",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "quote",
      "discriminator": [
        149,
        42,
        109,
        247,
        134,
        146,
        213,
        123
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "trader"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          },
          "relations": [
            "market",
            "parent",
            "target"
          ]
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "parent"
              },
              {
                "kind": "account",
                "path": "target"
              }
            ]
          },
          "relations": [
            "trader"
          ]
        },
        {
          "name": "parent",
          "relations": [
            "market"
          ]
        },
        {
          "name": "target",
          "relations": [
            "market"
          ]
        },
        {
          "name": "trader",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "yes",
          "type": "bool"
        },
        {
          "name": "buy",
          "type": "bool"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ],
      "returns": "u64"
    },
    {
      "name": "redeem",
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "trader"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          },
          "relations": [
            "market",
            "parent",
            "target"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "parent"
              },
              {
                "kind": "account",
                "path": "target"
              }
            ]
          },
          "relations": [
            "trader"
          ]
        },
        {
          "name": "parent",
          "relations": [
            "market"
          ]
        },
        {
          "name": "target",
          "relations": [
            "market"
          ]
        },
        {
          "name": "trader",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "registerEvent",
      "discriminator": [
        206,
        4,
        37,
        59,
        79,
        120,
        169,
        181
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "event",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  118,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "arg",
                "path": "binding"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "binding",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "ticker",
          "type": "string"
        },
        {
          "name": "instrument",
          "type": "string"
        },
        {
          "name": "termsHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "closeTs",
          "type": "i64"
        },
        {
          "name": "observationTs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "report",
      "discriminator": [
        96,
        121,
        245,
        84,
        178,
        45,
        48,
        91
      ],
      "accounts": [
        {
          "name": "reporter",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          },
          "relations": [
            "event"
          ]
        },
        {
          "name": "event",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "binding",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "termsHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "outcome",
          "type": {
            "defined": {
              "name": "outcome"
            }
          }
        },
        {
          "name": "sourceTs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setAuthorities",
      "discriminator": [
        124,
        254,
        44,
        240,
        197,
        70,
        190,
        107
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "reporter",
          "type": "pubkey"
        },
        {
          "name": "pauseAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setFee",
      "docs": [
        "Only changes the default for future markets. Existing LP/trader terms are immutable."
      ],
      "discriminator": [
        18,
        154,
        24,
        18,
        237,
        214,
        19,
        80
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "feeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "setPause",
      "discriminator": [
        63,
        32,
        154,
        2,
        56,
        103,
        79,
        45
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "startMarket",
      "discriminator": [
        75,
        226,
        21,
        239,
        183,
        247,
        3,
        234
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          },
          "relations": [
            "market",
            "parent",
            "target"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "parent"
              },
              {
                "kind": "account",
                "path": "target"
              }
            ]
          }
        },
        {
          "name": "parent",
          "relations": [
            "market"
          ]
        },
        {
          "name": "target",
          "relations": [
            "market"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "syncMarket",
      "discriminator": [
        196,
        58,
        190,
        32,
        134,
        150,
        86,
        80
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          },
          "relations": [
            "market",
            "parent",
            "target"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "parent"
              },
              {
                "kind": "account",
                "path": "target"
              }
            ]
          }
        },
        {
          "name": "parent",
          "relations": [
            "market"
          ]
        },
        {
          "name": "target",
          "relations": [
            "market"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "trade",
      "discriminator": [
        178,
        144,
        26,
        216,
        241,
        187,
        206,
        130
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "trader"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          },
          "relations": [
            "market",
            "parent",
            "target"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "parent"
              },
              {
                "kind": "account",
                "path": "target"
              }
            ]
          },
          "relations": [
            "trader"
          ]
        },
        {
          "name": "parent",
          "relations": [
            "market"
          ]
        },
        {
          "name": "target",
          "relations": [
            "market"
          ]
        },
        {
          "name": "trader",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "yes",
          "type": "bool"
        },
        {
          "name": "buy",
          "type": "bool"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "limit",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawLp",
      "discriminator": [
        225,
        221,
        45,
        211,
        49,
        60,
        51,
        163
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "lp"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.creator",
                "account": "config"
              }
            ]
          },
          "relations": [
            "market",
            "parent",
            "target"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "parent"
              },
              {
                "kind": "account",
                "path": "target"
              }
            ]
          },
          "relations": [
            "lp"
          ]
        },
        {
          "name": "parent",
          "relations": [
            "market"
          ]
        },
        {
          "name": "target",
          "relations": [
            "market"
          ]
        },
        {
          "name": "lp",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "externalEvent",
      "discriminator": [
        38,
        58,
        50,
        166,
        32,
        119,
        163,
        87
      ]
    },
    {
      "name": "lp",
      "discriminator": [
        31,
        47,
        62,
        188,
        110,
        128,
        12,
        82
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "trader",
      "discriminator": [
        74,
        133,
        32,
        105,
        47,
        50,
        5,
        238
      ]
    }
  ],
  "events": [
    {
      "name": "lifecycleEvent",
      "discriminator": [
        17,
        91,
        75,
        85,
        114,
        207,
        243,
        48
      ]
    },
    {
      "name": "quoteEvent",
      "discriminator": [
        60,
        127,
        206,
        255,
        56,
        94,
        200,
        179
      ]
    },
    {
      "name": "resolutionEvent",
      "discriminator": [
        58,
        223,
        109,
        183,
        183,
        149,
        169,
        251
      ]
    },
    {
      "name": "tradeEvent",
      "discriminator": [
        189,
        219,
        127,
        211,
        78,
        230,
        97,
        238
      ]
    },
    {
      "name": "withdrawalEvent",
      "discriminator": [
        161,
        53,
        185,
        18,
        98,
        254,
        54,
        165
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "math",
      "msg": "Arithmetic overflow or unsupported numeric range"
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Unauthorized authority or reporter"
    },
    {
      "code": 6002,
      "name": "binding",
      "msg": "Invalid immutable binding or configuration"
    },
    {
      "code": 6003,
      "name": "notTrading",
      "msg": "Trading is paused, closed, frozen or not started"
    },
    {
      "code": 6004,
      "name": "lifecycle",
      "msg": "Invalid lifecycle transition"
    },
    {
      "code": 6005,
      "name": "balance",
      "msg": "Insufficient conditional cash or holdings"
    },
    {
      "code": 6006,
      "name": "slippage",
      "msg": "Slippage limit exceeded"
    },
    {
      "code": 6007,
      "name": "insolvent",
      "msg": "Reserves do not cover all outcomes"
    },
    {
      "code": 6008,
      "name": "locked",
      "msg": "Withdrawal is locked until terminal settlement"
    },
    {
      "code": 6009,
      "name": "claimed",
      "msg": "Already redeemed"
    },
    {
      "code": 6010,
      "name": "conflict",
      "msg": "Conflicting final report"
    },
    {
      "code": 6011,
      "name": "timestamp",
      "msg": "Stale or invalid source timestamp"
    }
  ],
  "types": [
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "pendingAdmin",
            "type": "pubkey"
          },
          {
            "name": "reporter",
            "type": "pubkey"
          },
          {
            "name": "pauseAuthority",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "maxTrade",
            "type": "u64"
          },
          {
            "name": "maxDeposits",
            "type": "u64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "externalEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "binding",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ticker",
            "type": "string"
          },
          {
            "name": "instrument",
            "type": "string"
          },
          {
            "name": "termsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "closeTs",
            "type": "i64"
          },
          {
            "name": "observationTs",
            "type": "i64"
          },
          {
            "name": "registeredTs",
            "type": "i64"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "outcome"
              }
            }
          },
          {
            "name": "halted",
            "type": "bool"
          },
          {
            "name": "sourceTs",
            "type": "i64"
          },
          {
            "name": "submittedTs",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "lifecycleEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "status"
              }
            }
          },
          {
            "name": "traderLiability",
            "type": "u64"
          },
          {
            "name": "lpEquity",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "lp",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "deposited",
            "type": "u64"
          },
          {
            "name": "paid",
            "type": "u64"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "parent",
            "type": "pubkey"
          },
          {
            "name": "target",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "b",
            "type": "u64"
          },
          {
            "name": "offsetYes",
            "type": "u64"
          },
          {
            "name": "offsetNo",
            "type": "u64"
          },
          {
            "name": "yes",
            "type": "u64"
          },
          {
            "name": "no",
            "type": "u64"
          },
          {
            "name": "principal",
            "type": "u64"
          },
          {
            "name": "cash",
            "type": "u64"
          },
          {
            "name": "lpDeposits",
            "type": "u64"
          },
          {
            "name": "lpPool",
            "type": "u64"
          },
          {
            "name": "traderRemaining",
            "type": "u64"
          },
          {
            "name": "lpRemaining",
            "type": "u64"
          },
          {
            "name": "started",
            "type": "bool"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "status"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "feesAccrued",
            "docs": [
              "Conditional fees: embedded in LP residual on valid settlement; canceled on VOID."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "outcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "unresolved"
          },
          {
            "name": "yes"
          },
          {
            "name": "no"
          },
          {
            "name": "invalid"
          }
        ]
      }
    },
    {
      "name": "quoteEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "cost",
            "type": "u64"
          },
          {
            "name": "yesPriceE18",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "resolutionEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "event",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "outcome"
              }
            }
          },
          {
            "name": "halted",
            "type": "bool"
          },
          {
            "name": "sourceTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "status",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "funding"
          },
          {
            "name": "pending"
          },
          {
            "name": "active"
          },
          {
            "name": "frozen"
          },
          {
            "name": "halted"
          },
          {
            "name": "settledYes"
          },
          {
            "name": "settledNo"
          },
          {
            "name": "void"
          }
        ]
      }
    },
    {
      "name": "tradeEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "yes",
            "type": "bool"
          },
          {
            "name": "buy",
            "type": "bool"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "cashFlow",
            "type": "u64"
          },
          {
            "name": "conditionalCash",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "trader",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "principal",
            "type": "u64"
          },
          {
            "name": "cash",
            "type": "u64"
          },
          {
            "name": "yes",
            "type": "u64"
          },
          {
            "name": "no",
            "type": "u64"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "withdrawalEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "lp",
            "type": "bool"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
