---
title: "02 - Premier boot : linker script, pile et premier message UART"
date: 2026-09-11
draft: false
description: "Mise en place du linker script, du code de boot et du premier driver UART."
summary: "Mise en place du linker script, du code de boot et du premier driver UART."
series: ["AArch64 Bare-Metal Kernel"]
series_order: 2
tags:
  - AArch64
  - ARM
  - Kernel
  - Assembly
---

Bienvenue dans le deuxième article de la série sur le développement de mon noyau AArch64 bare-metal !

Dans cet article, je vais présenter la version v0.1 de ce projet. Le but de cette version est de faire un noyau basique qui contiendra :
- le linker
- le boot
- et le code du driver UART

À la fin, le noyau doit se lancer correctement dans QEMU et afficher une simple chaîne de caractères `Hello, AArch64!`.

Voici les fichiers concernés par cet article, et la section qui les explique :

| Fichier | Rôle | Section |
| --- | --- | --- |
| `linker.ld` | Script de link : position du code en mémoire, définition de `_stack_bottom` et `_stack_top` | [Le linker script](#le-linker-script) |
| `src/boot/boot.s` | Point d'entrée du noyau (`_start`), initialisation de la pile | [Le boot : initialiser la pile](#le-boot--initialiser-la-pile) |
| `src/uart/uart.s` | Driver UART minimal : `uart_putc` et `uart_puts` | [Le driver UART](#le-driver-uart) |
| `Makefile` | Compilation des fichiers assembleur et génération de `kernel.elf` | [Compiler et lancer le noyau](#compiler-et-lancer-le-noyau) |

> Le projet peut être retrouvé dans ce dépôt : [aarch64-baremetal-kernel](https://github.com/HalfTimeOfLife/aarch64-baremetal-kernel).

---

## QEMU `virt` et notions AArch64 de base

### Qu'est-ce que QEMU `virt` ?

Tout d'abord, je vais expliquer rapidement ce qu'est QEMU et la machine `virt`. 

QEMU est un émulateur qui va nous permettre de lancer notre noyau AArch64 sans avoir de composant ARM. 

La machine `virt` est une plateforme virtuelle générique conçue pour exécuter des systèmes invités. Elle permet de passer outre les contraintes d'un matériel spécifique.

### Layout mémoire simplifié

Voici la représentation de la mémoire simplifiée du projet :

```
 _______________ 0x00000000
|     Flash     |
|_______________|
|               |
|               |
|               |
|               |
|               |
|_______________|0x40000000
|      RAM      |
|_______________|
```

### Registres et instructions utilisés dans cet article

Dans cette section, je ne fais que lister les instructions et registres utilisés, ils seront expliqués plus en détails lors de l'explication du code.

#### Instructions 

| Instruction | Type               | Rôle                                                                           |
| ----------- | ------------------ | ------------------------------------------------------------------------------ |
| `ldr`       | Load               | Charge une valeur depuis la mémoire, ou charge une adresse avec `ldr xN, =...` |
| `ldrb`      | Load               | Charge 1 octet depuis la mémoire                                               |
| `str`       | Store              | Écrit une valeur en mémoire                                                    |
| `stp`       | Store Pair         | Sauvegarde deux registres en mémoire                                           |
| `ldp`       | Load Pair          | Restaure deux registres depuis la mémoire                                      |
| `mov`       | Data movement      | Copie une valeur d'un registre vers un autre                                   |
| `tst`       | Test               | Effectue un AND logique et met à jour les flags                                |
| `b`         | Branch             | Effectue un saut inconditionnel                                                |
| `b.ne`      | Conditional branch | Saute si le résultat précédent n'était pas zéro                                |
| `cbz`       | Conditional branch | Saute si un registre vaut zéro                                                 |
| `bl`        | Branch with Link   | Appelle une fonction et sauvegarde l'adresse de retour dans `x30`              |
| `ret`       | Return             | Retourne à l'adresse contenue dans `x30`                                       |

#### Registres 

| Registre    | Utilisation dans le code                           |
| ----------- | --------------------------------------------------- |
| `x0` / `w0` | Argument de fonction / caractère à envoyer à l'UART |
| `x1`        | Adresse de base de l'UART                           |
| `w2`        | Contenu du registre `UART_FR`                       |
| `x19`       | Pointeur vers la chaîne de caractères               |
| `x30`       | Link Register (`LR`), adresse de retour après `bl`  |
| `sp`        | Stack Pointer, pointeur de pile                     |


---

## Le linker script

Avant de pouvoir exécuter la moindre instruction, il faut dire au CPU où se trouve notre code en mémoire. C'est le rôle du linker script, écrit en `linker command language`.

> Voir : [Linker Scripts](https://wiki.osdev.org/Linker_Scripts)

### Pourquoi un linker script personnalisé ?

Sans linker script personnalisé, `ld` utiliserait son script par défaut, pensé pour un système hébergé. Le problème dans notre cas est qu'il n'a aucune idée de l'endroit où se trouve la RAM sur la machine QEMU virt, le code se retrouverait placé n'importe où, potentiellement à une adresse où le CPU ne peut même pas l'exécuter au démarrage.

Voici le linker script utilisé :

```text
ENTRY(_start)

SECTIONS
{
    . = 0x40000000;

    .text : {
        *(.text*)
    }

    .rodata : {
        *(.rodata*)
    }

    .data : {
        *(.data*)
    }

    .bss : {
        *(.bss*)
    }

    . = ALIGN(16);

    .stack :
    {
        _stack_bottom = .;
        . += 0x10000;
        _stack_top = .;
    }
}
```

Il faut donc lui dire explicitement où poser notre code. D'après la documentation de la machine QEMU `virt`, la RAM commence à l'adresse `0x40000000`. C'est pour ça que le linker script démarre avec `. = 0x40000000;`.

> `.` représente l'adresse mémoire courante.

> Voir : [‘virt’ generic virtual platform (virt) - Hardware configuration information for bare-metal programming](https://www.qemu.org/docs/master/system/arm/virt.html#hardware-configuration-information-for-bare-metal-programming)

### Les sections et l'alignement

Une fois l'adresse de départ fixée, le linker script organise le binaire en plusieurs sections :

- `.text` : le code exécutable
- `.rodata` : les données en lecture seule
- `.data` : les données initialisées
- `.bss` : les données non initialisées

Chaque bloc utilise un caractère `*`, par exemple `*(.text*)` pour `.text`. C'est nécessaire car les fichiers sources ne déclarent pas toujours une section `.text` brute. Par exemple `boot.s` utilise `.section .text.boot`. Le `*` après `.text` permet donc de regrouper dans une seule section finale toutes les sous-sections dont le nom commence par `.text`, quel que soit le fichier source d'origine.

Juste avant `.stack`, on trouve `. = ALIGN(16);`. La convention d'appel AArch64 impose que le pointeur de pile (`sp`) soit toujours aligné sur 16 octets. En alignant explicitement le curseur du linker avant de définir la zone de pile, on garantit que `_stack_top` respectera cette contrainte dès la première instruction dans `boot.s`.

### `_stack_bottom` et `_stack_top`

Le bloc `.stack : { ... }` du linker script définit la zone mémoire réservée à la pile. Il pose d'abord le symbole `_stack_bottom` à l'adresse courante (le bas de la pile) puis avance le "curseur" du linker de `0x10000` (64 Ko) avec `. += 0x10000;`, avant de poser `_stack_top` à la nouvelle position (le haut de la pile).

> La taille de 64 Ko est totalement arbitraire, mais largement suffisante à ce stade du projet.

---

## Le boot : initialiser la pile

Une fois le linker script en place, on peut écrire le tout premier code exécuté par le CPU au démarrage : `_start`.

```asm
.section .text.boot
.global _start

_start:
    ldr x0, =_stack_top
    mov sp, x0

    b .
```

`.section .text.boot` place ce code dans une sous-section de `.text`, ce qui lui permet d'être récupéré par le `*(.text*)` du linker script vu précédemment. `.global _start` rend le symbole visible en dehors de ce fichier, ce qui est nécessaire puisque le linker script référence ce même symbole via `ENTRY(_start)`. La commande `ENTRY()` indique là où le CPU doit commencer.

### `ldr x0, =_stack_top` / `mov sp, x0`

Ces deux instructions initialisent la pile :

```asm
ldr x0, =_stack_top
mov sp, x0
```

`ldr x0, =_stack_top` charge dans `x0` l'adresse du symbole `_stack_top` qui est défini par le linker script (le haut de la zone de pile réservée). `mov sp, x0` copie ensuite cette adresse dans le registre `sp`, le pointeur de pile.

### Pourquoi cette forme précise ?

**Pourquoi `ldr x0, =_stack_top` et pas un simple `mov` ?**
L'instruction `mov` avec une valeur immédiate ne peut encoder qu'un nombre limité de bits directement dans l'instruction. L'adresse de `_stack_top` étant une adresse 64 bits complète, elle ne peut pas toujours tenir dans cet espace. La pseudo-instruction `ldr x0, =...` demande à l'assembleur de générer le code nécessaire pour charger l'adresse complète.

**Pourquoi passer par `x0` plutôt que d'écrire directement dans `sp` ?**
Le jeu d'instructions AArch64 n'autorise pas `sp` comme registre de destination pour cette forme de `ldr`. On passe donc par `x0` comme intermédiaire.

---

## Le driver UART

Maintenant que notre noyau boot, il est temps de faire quelque chose avec. L'objectif maintenant est de permettre à notre noyau d'afficher des caractères à l'écran. Pour cela nous allons utiliser un UART.

> Tout le code décrit dans cette partie peut se trouver dans le fichier `src/uart/uart.s`.

### Qu'est-ce que l'UART, et pourquoi le MMIO ?

Tout d'abord, un UART (*Universal Asynchronous Receiver Transmitter*) est un périphérique matériel utilisé pour la communication série.

Le MMIO (*Memory-mapped I/O*) fait en sorte que les registres de l'UART soient mappés à des adresses mémoire précises. Donc lire et écrire à ces adresses permet de dialoguer directement avec le matériel. Cela permet donc d'utiliser directement les instructions `ldr` et `str`.

### `UART_BASE`, `UART_FR`, `UART_DR`

L'adresse de base de l'UART (`UART_BASE`) est `0x09000000`, elle est fixée par QEMU `virt`.
`UART_FR` correspond au *flag register*, autrement dit, à l'état du périphérique : si dans ce registre le bit `TXFF` (mask `0x20`) est set alors la file de transmission est pleine et donc on ne peut envoyer des données au périphérique. Il est à l'offset `0x18`.

`UART_DR` correspond au *data register*, autrement dit, à l'endroit où le périphérique reçoit des données, c'est donc ici que l'on va écrire un caractère. Il est à l'offset `0x00`.

On va donc ajouter cela dans notre fichier :

```asm
.equ UART_BASE, 0x09000000
.equ UART_FR,   0x18
.equ UART_DR,   0x00
.equ UART_TXFF, 0x20
```

### `uart_putc`

Tout d'abord nous allons écrire un seul caractère, pour cela on fait une boucle `wait:` qui charge le contenu de `UART_FR` dans `w2`, teste le bit TXFF avec `tst` et reboucle tant que la file est pleine (`b.ne wait`).

Une fois la file libre, on écrit le caractère dans `UART_DR` (`str w0, [x1, #UART_DR]`), d'après la convention d'appel AArch64 `x0` est le premier argument et `w0` est la partie inférieure de `x0` (32 premiers bits).

Enfin, on fait un retour à l'appelant avec `ret`.

Voici le code complet de la fonction :

```asm
uart_putc:
    ldr x1, =UART_BASE

wait:
    ldr w2, [x1, #UART_FR]
    tst w2, #UART_TXFF
    b.ne wait

    str w0, [x1, #UART_DR]

    ret
```

### `uart_puts`

Maintenant il faut être capable d'afficher une chaîne de caractères. On va donc écrire une fonction `uart_puts` qui reçoit un pointeur vers une chaîne terminée par `\0` dans `x0` et qui va boucler sur cette chaîne, en appelant `uart_putc` pour chaque caractère.

Voici le code de la fonction :

```asm
uart_puts:
    stp x19, x30, [sp, #-16]!
    mov x19, x0

loop:
    ldrb w0, [x19], #1
    cbz w0, done
    bl uart_putc
    b loop

done:
    ldp x19, x30, [sp], #16
    ret
```

Tout d'abord, on sauvegarde `x19` et `x30` sur la pile (voir [Pourquoi sauver `x19` ?](#pourquoi-sauver-x19-)). On copie le contenu de `x0` dans `x19` puis on charge le caractère courant de `x19` dans `w0` et ensuite on incrémente `x19` d'un octet.

À chaque caractère, on teste si ce dernier est un caractère de fin de chaîne : `cbz w0, done`. Si c'est le cas, on sort de la boucle (branche vers `done`) sinon on appelle `uart_putc` sur le caractère et on revient au début de la boucle.

Si la chaîne est entièrement affichée, on restaure `x19` et `x30` puis on fait un retour à l'appelant avec `ret`.

### Pourquoi sauver `x19` ?

En AArch64, `x19` est un registre callee-saved, ainsi `uart_puts` doit le sauvegarder avant de l'utiliser, car `uart_putc` pourrait le modifier, puis le restaurer avant de retourner. L'instruction `stp x19, x30, [sp, #-16]!` sauvegarde à la fois `x19` et l'adresse de retour `x30` en 16 octets, tout en respectant l'alignement de la pile sur 16 octets.

---

## Compiler et lancer le noyau

Maintenant que le code est écrit, on doit compiler et lancer le noyau.

### Le Makefile

Dans cette partie, je ne vais pas détailler tout le Makefile, juste les composantes importantes.

> Le Makefile complet du projet peut être trouvé dans le dépôt : [aarch64-baremetal-kernel](https://github.com/HalfTimeOfLife/aarch64-baremetal-kernel).

Je vais expliquer ce bout du Makefile :

```makefile
SRC := $(wildcard src/*/*.s)

OUTPUT_DIR := build

OBJ := $(patsubst src/%.s,$(OUTPUT_DIR)/%.o,$(SRC))


$(OUTPUT_DIR)/%.o: src/%.s
	mkdir -p $(@D)
	$(AS) -c $< -o $@
```

- `$(wildcard src/*/*.s)` : Cherche tous les fichiers `.s` dans n'importe quel sous-dossier de `src/` (donc `src/boot/boot.s`, `src/uart/uart.s`, etc.)
- `$(patsubst src/%.s,$(OUTPUT_DIR)/%.o,$(SRC))` : Reconstruit le même chemin sous `build/` pour chaque fichier objet correspondant
- `mkdir -p $(@D)` crée les sous-dossiers nécessaires dans `build/` à la volée

Le Makefile va donc créer l'arborescence suivante :

```text
├── Makefile
└── build/
    ├── boot/
    │   └── boot.o
    ├── uart/
    │   └── uart.o
    └── kernel.elf
```

### Vérifier les symboles avec `nm`

Avant de lancer le noyau avec QEMU, on vérifie que le binaire contient bien ce qu'on attend. Pour cela, on utilise la commande `aarch64-none-elf-nm build/kernel.elf` qui permet de vérifier que les symboles existent et sont résolus, on doit donc retrouver les symboles suivants :

```text
_start
uart_putc
uart_puts
_stack_bottom
_stack_top
```

On peut aussi utiliser `objdump -d build/kernel.elf` pour voir le désassemblage du binaire.

### Lancer avec QEMU

Voici la commande complète pour lancer notre noyau avec QEMU :

```bash
qemu-system-aarch64 \
    -M virt \
    -cpu cortex-a57 \
    -nographic \
    -kernel build/kernel.elf
```

Voici en détail ce que fait chaque option :

- `-M virt` : demande à utiliser la machine virtuelle `virt`
- `-cpu cortex-a57` : modèle de CPU AArch64 émulé
- `-nographic` : pas de fenêtre graphique, l'UART redirigé vers stdout
- `-kernel build/kernel.elf` : charge directement notre ELF

### Résultat

On obtient donc cela :

<video controls width="100%">
  <source src="demo-uart.mp4" type="video/mp4">
</video>

---

## Conclusion

À l'issue de cette première version, ce projet a maintenant un linker script qui place le code exactement où le CPU s'attend à le trouver, une pile correctement initialisée, et un premier driver matériel qui fonctionne.

Merci d'avoir lu jusqu'au bout, et à bientôt pour le prochain article : **Les exceptions : construire la table de vecteurs**.