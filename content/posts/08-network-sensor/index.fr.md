---
title: "08 - Surveillance des connexions réseau avec la Windows Filtering Platform"
date: 2026-09-24
draft: true
description: "Troisième capteur de KDAMonitor : capture des connexions IPv4 entrantes et sortantes."
summary: "Troisième capteur de KDAMonitor : capture des connexions IPv4 entrantes et sortantes."
series: ["KDAMonitor"]
series_order: 8
tags:
  - KDAMonitor
  - Windows Kernel
  - Kernel Driver
  - C
---

Bienvenue dans le huitième article de la série sur le développement de KDAMonitor !

Dans cet article qui reprend la v0.8 du projet, je vais implémenter le troisième capteur de KDAMonitor : le capteur des connexions réseau. Pour rappel, dans l'article précédent (sur la v0.7), j'avais implémenté la session WFP (moteur, `provider` et `sublayer`) sans rajouter la partie observation.

Le capteur devra inspecter les paquets `IPv4` qui passent, sans les bloquer, et en extraire les données importantes. Contrairement aux autres capteurs, il n'y a pas de routine ou de *callback* cette fois : on va parler d'un *callout* appelé par un filtre qu'on ajoute au `sublayer`.

Voici les fichiers concernés par cet article, et la section qui les explique :

| Fichier | Rôle | Section |
| --- | --- | --- |
| `event_types.h` | Nouveau type `KDAMON_NETWORK_EVENT_DATA`, enum `KDAMON_NETWORK_DIRECTION` + union dans `KDAMON_EVENT` | [Que récupérer lors d'une connexion réseau ?](#que-récupérer-lors-dune-connexion-réseau-) |
| `guids.c` | Centralisation des `DEFINE_GUID` (session + callouts) | [Centraliser les GUID](#centraliser-les-guid) |
| `wfp_callout.h` | Déclaration du register/unregister | [Implémenter le callout](#implémenter-le-callout) |
| `wfp_callout.c` | Les callouts, leurs filtres, l'enregistrement | [Implémenter le callout](#implémenter-le-callout) |
| `wfp_session.c` / `wfp_session.h` | Handle du moteur partagé, poids du sublayer | [Adapter la session WFP](#adapter-la-session-wfp) |
| `log_writer.c` | Sérialisation JSONL des événements réseau | [Sérialiser les événements réseau en JSONL](#sérialiser-les-événements-réseau-en-jsonl) |
| `driver_entry.c` | Enregistrement/désenregistrement du callout | [Intégration dans `driver_entry.c`](#intégration-dans-driver_entryc) |

> Le projet peut être retrouvé dans ce dépôt : [KDAMonitor](https://github.com/HalfTimeOfLife/KDAMonitor).

---

## Que récupérer lors d'une connexion réseau ?

Comme pour chaque capteur, il faut d'abord décider quelles informations retenir d'une connexion réseau. J'en ai retenu six :

- le PID du processus à l'origine de la connexion
- le chemin de ce processus
- le protocole utilisé
- l'adresse IP et le port locaux
- l'adresse IP et le port distants
- la direction : la connexion est-elle entrante ou sortante ?

On a donc les structures suivantes :

```c
typedef enum _KDAMON_NETWORK_DIRECTION {
    KDAMON_NETWORK_DIRECTION_INBOUND,
    KDAMON_NETWORK_DIRECTION_OUTBOUND,
} KDAMON_NETWORK_DIRECTION;

typedef struct _KDAMON_NETWORK_EVENT_DATA {
    ULONG  ProcessId;
    WCHAR ProcessPath[260];

    UINT8  Protocol;

    ULONG  LocalIp;
    USHORT LocalPort;

    ULONG  RemoteIp;
    USHORT RemotePort;

    KDAMON_NETWORK_DIRECTION Direction;
} KDAMON_NETWORK_EVENT_DATA;
```

> Pour les adresses IP et les ports, j'ai choisi `ULONG` et `USHORT` par simplicité, ce qui limite cette version à IPv4.

Il faut bien sûr l'ajouter dans l'union de la structure finale :

```c
typedef struct _KDAMON_EVENT
{
...
    union
    {
        KDAMON_PROCESS_EVENT_DATA Process;
        KDAMON_IMAGE_LOAD_EVENT_DATA ImageLoad;
        KDAMON_NETWORK_EVENT_DATA Network;
    } Data;
} KDAMON_EVENT, * PKDAMON_EVENT;
```

> Le magic number `260` correspond à la longueur maximale des chemins dans Windows et sera changé en une macro dans une version ultérieure :)

---

## Comment fonctionne un callout WFP ?

Jusqu'ici, tous les capteurs fonctionnaient sur le même principe de `callback` : on donnait à Windows une fonction, via une routine, et il l'exécutait quand l'événement se produisait. Le moteur WFP n'appelle pas directement nos fonctions. Il applique des filtres au trafic, et si un paquet passe le filtre, celui-ci déclenche notre **callout**.

Dans l'article précédent, on a ouvert la session et enregistré le provider et le sublayer. Il manque maintenant ce qui va réellement regarder le trafic.

### Les couches ALE

WFP découpe le traitement réseau en plusieurs couches. Celles qui nous intéressent sont les couches **ALE** (*Application Layer Enforcement*, [documentation](https://learn.microsoft.com/en-us/windows/win32/fwp/ale-layers)), qui suivent les connexions au niveau applicatif et fournissent le PID et le chemin du processus dans les métadonnées. J'en utilise deux :

| Couche | Direction | Se déclenche pour |
| --- | --- | --- |
| `FWPM_LAYER_ALE_AUTH_CONNECT_V4` | sortant | un `connect()` TCP, le premier paquet UDP vers un couple adresse/port distant, le premier message ICMP sortant |
| `FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V4` | entrant | une connexion TCP entrante, le premier paquet UDP entrant depuis un couple adresse/port, le premier message ICMP entrant |

On obtient donc une notification par connexion (ou par flux UDP/ICMP). Pour chaque direction, il y a trois objets à mettre en place :

1. **Le callout noyau**, avec [`FwpsCalloutRegister2`](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/fwpsk/nf-fwpsk-fwpscalloutregister2). C'est ici qu'on fournit nos fonctions dans une structure [`FWPS_CALLOUT2`](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/fwpsk/ns-fwpsk-fwps_callout2_) : [`classifyFn`](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/fwpsk/nc-fwpsk-fwps_callout_classify_fn2) (appelée quand du trafic correspond à un filtre), `notifyFn` (notifications sur les filtres ajoutés ou retirés) et `flowDeleteFn` (inutile ici, laissée à `NULL`).
2. **L'ajout du callout**, avec [`FwpmCalloutAdd`](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/fwpmk/nf-fwpmk-fwpmcalloutadd0), qui annonce au moteur qu'un callout existe pour telle couche.
3. **Le filtre**, avec [`FwpmFilterAdd`](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/fwpmk/nf-fwpmk-fwpmfilteradd0), qui se place dans notre sublayer et désigne le callout.

### Observer sans bloquer

Dans notre cas, le filtre ne sert pas à filtrer : il sert à déclencher le callout sur tout le trafic IPv4 de la couche, pour en extraire des informations. On lui donne l'action `FWP_ACTION_CALLOUT_INSPECTION`, qui indique que le callout observe sans décider, donc sans bloquer. En retour, `classifyFn` doit rendre `FWP_ACTION_CONTINUE` pour que le trafic poursuive son chemin.

---

## Centraliser les GUID

Le callout, le filtre, le provider et le sublayer sont tous identifiés par des GUID. Lors de la v0.7, les deux GUID de la session étaient définis en haut de `wfp_session.c`. Avec les deux GUID des callouts, qui sont utilisés dans `wfp_callout.c`, il y en a maintenant quatre répartis sur plusieurs fichiers. Je les ai donc regroupés dans un fichier dédié, `guids.c`.

On définit `INITGUID` dans `guids.c` uniquement, et les autres fichiers ne voient que les déclarations `extern const GUID` de leurs headers :

```c
// guids.c
#define INITGUID
#include <guiddef.h>
#include <ntddk.h>

#define NDIS630
#include <ndis.h>

#include <fwpmk.h>

// --- Session GUIDs ---
DEFINE_GUID(KDAMON_WFP_PROVIDER_GUID, ...);
DEFINE_GUID(KDAMON_WFP_SUBLAYER_GUID, ...);

// --- Callout GUIDs ---
DEFINE_GUID(KDAMON_WFP_CALLOUT_OUTBOUND_GUID, ...);
DEFINE_GUID(KDAMON_WFP_CALLOUT_INBOUND_GUID, ...);
```

```c
// wfp_callout.h
extern const GUID KDAMON_WFP_CALLOUT_OUTBOUND_GUID;
extern const GUID KDAMON_WFP_CALLOUT_INBOUND_GUID;
```

Ainsi, `wfp_session.c` n'a plus besoin de définir `INITGUID` ni ses propres GUID, et si un GUID change, il n'y a qu'un seul endroit à modifier.

---

## Implémenter le callout

Tout est dans le fichier `wfp_callout.c`. Deux fonctions sont exposées dans le header, et tout le reste est privé :

- `NTSTATUS KdaMonWfpCalloutRegister(PDEVICE_OBJECT DeviceObject);` : enregistre les callouts et leurs filtres
- `VOID KdaMonWfpCalloutUnregister(VOID);` : les retire

Le fichier garde en variables globales les identifiants renvoyés par WFP, nécessaires pour tout retirer plus tard :

```c
static UINT32 g_WpsCalloutIdOutbound = 0;
static UINT32 g_WpsCalloutIdInbound = 0;
static UINT64 g_FilterIdOutbound = 0;
static UINT64 g_FilterIdInbound = 0;
```

### Le traitement des paquets

Quand un paquet correspond au filtre, WFP appelle `classifyFn` avec trois paramètres :

- `inFixedValues` : les champs de la couche filtrée (protocole, adresses, ports)
- `inMetaValues` : les métadonnées (PID, chemin du processus)
- `classifyOut` : où on indique au moteur ce qu'on décide

Les champs de `inFixedValues` sont accessibles par un indice `FWPS_FIELD_*` qui dépend de la couche. Le traitement est identique pour les connexions sortantes et entrantes, on a donc une fonction commune qui reçoit ces indices en paramètres :

```c
static VOID KdaMonWfpClassifyCommon(
    _In_    const FWPS_INCOMING_VALUES0* inFixedValues,
    _In_    const FWPS_INCOMING_METADATA_VALUES0* inMetaValues,
    _Inout_ FWPS_CLASSIFY_OUT0* classifyOut,
    _In_    KDAMON_NETWORK_DIRECTION Direction,
    _In_    UINT32 FieldProtocol,
    _In_    UINT32 FieldLocalIp,
    _In_    UINT32 FieldLocalPort,
    _In_    UINT32 FieldRemoteIp,
    _In_    UINT32 FieldRemotePort
)
{
    KDAMON_EVENT Event = { 0 };

    Event.Type = KdaMonEventNetwork;
    KeQuerySystemTimePrecise(&Event.Timestamp);

    // --- PID ---
    Event.Data.Network.ProcessId = (ULONG)inMetaValues->processId;

    // --- Process path ---
    if (inMetaValues->processPath &&
        inMetaValues->processPath->data &&
        inMetaValues->processPath->size > 0)
    {
        SIZE_T bytesToCopy = min(
            inMetaValues->processPath->size,
            (RTL_NUMBER_OF(Event.Data.Network.ProcessPath) - 1) * sizeof(WCHAR)
        );
        RtlCopyMemory(Event.Data.Network.ProcessPath,
            inMetaValues->processPath->data,
            bytesToCopy);
        Event.Data.Network.ProcessPath[bytesToCopy / sizeof(WCHAR)] = L'\0';
    }

    // --- Protocol, IPs, ports ---
    Event.Data.Network.Protocol = (UINT8)inFixedValues->incomingValue[FieldProtocol].value.uint8;
    Event.Data.Network.LocalIp = inFixedValues->incomingValue[FieldLocalIp].value.uint32;
    Event.Data.Network.RemoteIp = inFixedValues->incomingValue[FieldRemoteIp].value.uint32;
    Event.Data.Network.LocalPort = inFixedValues->incomingValue[FieldLocalPort].value.uint16;
    Event.Data.Network.RemotePort = inFixedValues->incomingValue[FieldRemotePort].value.uint16;

    Event.Data.Network.Direction = Direction;

    KdaMonEventQueuePush(&Event);

    classifyOut->actionType = FWP_ACTION_CONTINUE;
}
```

Voici un résumé du déroulement de la fonction :

1. On crée l'événement comme pour les autres capteurs.
2. Le PID vient des métadonnées et WFP le fournit sur 64 bits, on le réduit à un `ULONG`.
3. Le chemin du processus est fourni sous forme de blob (`FWP_BYTE_BLOB`) dont la taille est en octets.
4. Protocole, adresses et ports sont lus dans `inFixedValues` et ajoutés à l'événement.
5. On ajoute l'événement dans la file et on rend `FWP_ACTION_CONTINUE`.

> On garde le chemin au format NT (`\Device\HarddiskVolume3\...`) et non au format Win32 (`C:\...`).

### Les deux `classifyFn`

Ce que WFP appelle, ce sont deux fonctions, une pour chaque sens. Elles se contentent d'indiquer la direction et les indices de champs de leur couche :

```c
static VOID KdaMonWfpClassifyFnOutbound(
    _In_        const FWPS_INCOMING_VALUES0* inFixedValues,
    _In_        const FWPS_INCOMING_METADATA_VALUES0* inMetaValues,
    _Inout_opt_ VOID* layerData,
    _In_opt_    const VOID* classifyContext,
    _In_        const FWPS_FILTER2* filter,
    _In_        UINT64 flowContext,
    _Inout_     FWPS_CLASSIFY_OUT0* classifyOut
)
{
    UNREFERENCED_PARAMETER(layerData);
    UNREFERENCED_PARAMETER(classifyContext);
    UNREFERENCED_PARAMETER(filter);
    UNREFERENCED_PARAMETER(flowContext);

    KdaMonWfpClassifyCommon(
        inFixedValues, inMetaValues, classifyOut,
        KDAMON_NETWORK_DIRECTION_OUTBOUND,
        FWPS_FIELD_ALE_AUTH_CONNECT_V4_IP_PROTOCOL,
        FWPS_FIELD_ALE_AUTH_CONNECT_V4_IP_LOCAL_ADDRESS,
        FWPS_FIELD_ALE_AUTH_CONNECT_V4_IP_LOCAL_PORT,
        FWPS_FIELD_ALE_AUTH_CONNECT_V4_IP_REMOTE_ADDRESS,
        FWPS_FIELD_ALE_AUTH_CONNECT_V4_IP_REMOTE_PORT
    );
}
```

La version entrante, `KdaMonWfpClassifyFnInbound`, est identique : elle passe `KDAMON_NETWORK_DIRECTION_INBOUND` et les indices `FWPS_FIELD_ALE_AUTH_RECV_ACCEPT_V4_*`. La `notifyFn` est aussi demandée à l'enregistrement, mais on ne s'en sert pas. Donc, `KdaMonWfpNotifyFn` est un simple stub qui retourne `STATUS_SUCCESS`.

### Enregistrer les callouts

`KdaMonWfpCalloutRegister` fait, pour chaque direction, les trois étapes vues plus haut. Pour la connexion sortante, on a :

```c
NTSTATUS KdaMonWfpCalloutRegister(_In_ PDEVICE_OBJECT DeviceObject)
{
    NTSTATUS      status;
    FWPS_CALLOUT2 callout_s = { 0 };
    FWPM_CALLOUT  callout_m = { 0 };
    FWPM_FILTER   filter = { 0 };

    // =========================================================
    // OUTBOUND — FWPM_LAYER_ALE_AUTH_CONNECT_V4
    // =========================================================

    RtlCopyMemory(&callout_s.calloutKey, &KDAMON_WFP_CALLOUT_OUTBOUND_GUID, sizeof(GUID));
    callout_s.flags = 0;
    callout_s.classifyFn = KdaMonWfpClassifyFnOutbound;
    callout_s.notifyFn = KdaMonWfpNotifyFn;
    callout_s.flowDeleteFn = NULL;

    status = FwpsCalloutRegister2(DeviceObject, &callout_s, &g_WpsCalloutIdOutbound);
    if (!NT_SUCCESS(status))
    {
        KdPrint((DRIVER_TAG " [ERROR]: FwpsCalloutRegister2 (outbound) failed: 0x%X\n", status));
        return status;
    }
```

On enregistre d'abord le callout côté noyau avec ses fonctions.

```c
    RtlCopyMemory(&callout_m.calloutKey, &KDAMON_WFP_CALLOUT_OUTBOUND_GUID, sizeof(GUID));
    RtlCopyMemory(&callout_m.applicableLayer, &FWPM_LAYER_ALE_AUTH_CONNECT_V4, sizeof(GUID));
    callout_m.displayData.name = KDAMON_WFP_CALLOUT_OUTBOUND_NAME;
    callout_m.displayData.description = KDAMON_WFP_CALLOUT_OUTBOUND_DESCRIPTION;
    callout_m.flags = 0;

    status = FwpmCalloutAdd(g_EngineHandle, &callout_m, NULL, NULL);
    if (!NT_SUCCESS(status))
    {
        KdPrint((DRIVER_TAG " [ERROR]: FwpmCalloutAdd (outbound) failed: 0x%X\n", status));
        KdaMonWfpCalloutUnregister();
        return status;
    }
```

Ensuite, on ajoute le callout au moteur pour la couche `FWPM_LAYER_ALE_AUTH_CONNECT_V4`.

```c
    RtlZeroMemory(&filter, sizeof(filter));
    filter.displayData.name = KDAMON_WFP_FILTER_OUTBOUND_NAME;
    filter.displayData.description = KDAMON_WFP_FILTER_OUTBOUND_DESCRIPTION;
    filter.providerKey = (GUID*)&KDAMON_WFP_PROVIDER_GUID;
    filter.numFilterConditions = 0;
    filter.filterCondition = NULL;
    filter.action.type = FWP_ACTION_CALLOUT_INSPECTION;
    RtlCopyMemory(&filter.layerKey, &FWPM_LAYER_ALE_AUTH_CONNECT_V4, sizeof(GUID));
    RtlCopyMemory(&filter.subLayerKey, &KDAMON_WFP_SUBLAYER_GUID, sizeof(GUID));
    RtlCopyMemory(&filter.action.calloutKey, &KDAMON_WFP_CALLOUT_OUTBOUND_GUID, sizeof(GUID));

    status = FwpmFilterAdd(g_EngineHandle, &filter, NULL, &g_FilterIdOutbound);
    if (!NT_SUCCESS(status))
    {
        KdPrint((DRIVER_TAG " [ERROR]: FwpmFilterAdd (outbound) failed: 0x%X\n", status));
        KdaMonWfpCalloutUnregister();
        return status;
    }

    KdPrint((DRIVER_TAG " [SUCCESS]: WFP outbound callout registered\n"));
```

Enfin, le filtre est rattaché à notre provider et à notre sublayer, sur la même couche.

La partie entrante suit exactement les mêmes étapes, avec `KDAMON_WFP_CALLOUT_INBOUND_GUID`, `KdaMonWfpClassifyFnInbound` et la couche `FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V4`.

### Désenregistrer les callouts

```c
VOID KdaMonWfpCalloutUnregister(VOID)
{
    if (g_FilterIdInbound != 0)
    {
        FwpmFilterDeleteById(g_EngineHandle, g_FilterIdInbound);
        g_FilterIdInbound = 0;
    }

    if (g_FilterIdOutbound != 0)
    {
        FwpmFilterDeleteById(g_EngineHandle, g_FilterIdOutbound);
        g_FilterIdOutbound = 0;
    }

    if (g_WpsCalloutIdInbound != 0)
    {
        FwpmCalloutDeleteByKey(g_EngineHandle, &KDAMON_WFP_CALLOUT_INBOUND_GUID);
        FwpsCalloutUnregisterById(g_WpsCalloutIdInbound);
        g_WpsCalloutIdInbound = 0;
    }

    if (g_WpsCalloutIdOutbound != 0)
    {
        FwpmCalloutDeleteByKey(g_EngineHandle, &KDAMON_WFP_CALLOUT_OUTBOUND_GUID);
        FwpsCalloutUnregisterById(g_WpsCalloutIdOutbound);
        g_WpsCalloutIdOutbound = 0;
    }
}
```

On retire d'abord les deux filtres puis chaque callout, côté gestion avec `FwpmCalloutDeleteByKey` et côté noyau avec `FwpsCalloutUnregisterById`.

---

## Adapter la session WFP

Il faut faire deux modifications dans `wfp_session.c` pour que le callout fonctionne avec la session de l'article précédent.

### Partager le handle du moteur

Le callout a besoin du handle de la session pour appeler `FwpmCalloutAdd` et `FwpmFilterAdd`. Jusqu'ici, `g_EngineHandle` était `static` et donc privé à `wfp_session.c`. Il devient donc global, et le header le déclare :

```c
// wfp_session.h
extern HANDLE g_EngineHandle;
```

```c
// wfp_session.c
HANDLE g_EngineHandle = NULL;
```

Le callout réutilise ainsi la session ouverte par `KdaMonWfpSessionInit`.

### La priorité du sublayer

Le poids du sublayer passe de `0` à `0xFFFF`, la valeur maximale :

```c
subLayer.weight = (UINT16)0xFFFF;
```

Plus le poids d'un sublayer est élevé, plus tôt il est évalué. Notre sublayer est donc appelé avant les autres. Comme le capteur ne fait qu'observer, il est préférable qu'il soit appelé en premier plutôt que de dépendre de l'ordre des autres sublayers.

---

## Sérialiser les événements réseau en JSONL

Voici la fonction dédiée à la sérialisation des événements réseau :

```c
static NTSTATUS KdaMonLogWriterWriteNetworkEvent(
    _In_                            const KDAMON_EVENT* Event,
    _Out_writes_z_(BufferSize) PSTR EventBuffer,
    _In_                            SIZE_T              BufferSize)
{
    CHAR EscapedPath[520];
    ULONG localIp = Event->Data.Network.LocalIp;
    ULONG remoteIp = Event->Data.Network.RemoteIp;

    if (!KdaMonJsonEscapeW(Event->Data.Network.ProcessPath, EscapedPath, sizeof(EscapedPath)))
    {
        KdPrint((DRIVER_TAG " [WARNING]: Process path truncated during JSON escape (event %lu)\n", Event->Id));
    }

    const char* direction = (Event->Data.Network.Direction == KDAMON_NETWORK_DIRECTION_OUTBOUND)
        ? "outbound"
        : "inbound";

    const char* protocol;
    switch (Event->Data.Network.Protocol)
    {
    case 1:  protocol = "ICMP"; break;
    case 6:  protocol = "TCP";  break;
    case 17: protocol = "UDP";  break;
    default: protocol = "UNKNOWN"; break;
    }

    return RtlStringCbPrintfA(
        EventBuffer,
        BufferSize,
        "{\"id\":%lu,\"type\":\"%s\",\"timestamp\":%lld,"
        "\"pid\":%lu,\"process\":\"%s\","
        "\"direction\":\"%s\",\"protocol\":\"%s\","
        "\"local_ip\":\"%u.%u.%u.%u\",\"local_port\":%u,"
        "\"remote_ip\":\"%u.%u.%u.%u\",\"remote_port\":%u}\n",
        Event->Id,
        KdaMonEventTypeToString(Event->Type),
        Event->Timestamp.QuadPart,
        Event->Data.Network.ProcessId,
        EscapedPath,
        direction,
        protocol,
        (localIp >> 24) & 0xFF, (localIp >> 16) & 0xFF,
        (localIp >> 8) & 0xFF, localIp & 0xFF,
        Event->Data.Network.LocalPort,
        (remoteIp >> 24) & 0xFF, (remoteIp >> 16) & 0xFF,
        (remoteIp >> 8) & 0xFF, remoteIp & 0xFF,
        Event->Data.Network.RemotePort
    );
}
```

Voici le déroulement de la fonction :

1. On échappe les caractères spéciaux du chemin du processus avec `KdaMonJsonEscapeW`.
2. On convertit la direction en texte (`outbound` ou `inbound`).
3. On convertit le numéro de protocole en nom : 1 pour ICMP, 6 pour TCP, 17 pour UDP, et `UNKNOWN` pour le reste.
4. On découpe chaque adresse IPv4 en quatre octets par décalages de bits pour l'écrire sous la forme `a.b.c.d`.
5. On remplit le buffer `EventBuffer` au format JSON.

La ligne d'événement d'une connexion réseau aura la forme suivante :

```json
{"id":151,"type":"Network","timestamp":134303323937637081,"pid":10548,"process":"\\device\\harddiskvolume3\\windows\\system32\\curl.exe","direction":"outbound","protocol":"TCP","local_ip":"192.168.158.130","local_port":57977,"remote_ip":"104.20.23.154","remote_port":80}
```

Il ne reste qu'à rajouter cette fonction dans le `switch` de `KdaMonLogWriterWriteEvent` :

```c
case KdaMonEventNetwork:
    status = KdaMonLogWriterWriteNetworkEvent(Event, EventBuffer, sizeof(EventBuffer));
    break;
```

---

## Intégration dans `driver_entry.c`

Le callout est le premier producteur enregistré, et le dernier désenregistré.

Donc dans `DriverUnload` :

```c
void DriverUnload(_In_ PDRIVER_OBJECT DriverObject)
{
	UNREFERENCED_PARAMETER(DriverObject);

	KdPrint((DRIVER_TAG " [INFO]: Driver Unload begin\n"));

	// --- Unregister callbacks ---
	KdaMonImageCallbackUnregister();
	KdaMonProcessCallbackUnregister();

	// --- Stop the log writer ---
	KdaMonLogWriterStop();

	// --- Destroy the event queue ---
	KdaMonEventQueueDestroy();

	// --- Cleanup WFP callout ---
	KdaMonWfpCalloutUnregister();

	// --- Cleanup WFP session ---
	KdaMonWfpSessionCleanup();
	
	// --- Delete device object ---
	KdaMonDeleteDevice(&g_DeviceObject);
	KdPrint((DRIVER_TAG " [INFO]: Driver Unload complete\n"));
}
```

Dans `DriverEntry`, on l'enregistre après l'initialisation de la session WFP, avant la file :

```c
	status = KdaMonWfpCalloutRegister(g_DeviceObject);
	if (!NT_SUCCESS(status))
	{
		KdPrint((DRIVER_TAG " [ERROR]: KdaMonWfpCalloutRegister failed\n"));
		goto cleanup_wfp;
	}
```

> Cet ordre n'est pas idéal car `classifyFn` pousse dans la file d'événements, or le callout est enregistré avant sa création et désenregistré après sa destruction. Je le corrigerai lors du refactor de la v0.11.

---

## Validation

Pour cette version, il faut vérifier :

- que les objets WFP de KDAMonitor sont bien enregistrés puis retirés
- que des événements réseau arrivent bien jusque dans le fichier de log

Comme pour la v0.7, j'utilise `netsh wfp show state` avant, pendant, et après le cycle de vie du driver. Entre le chargement et le déchargement, le script génère du trafic sortant et entrant, puis lit le journal une fois le driver arrêté (`test_v08.ps1`) :

```powershell
# test_v08.ps1

$Driver = "KDAMonitor"
$DriverPath = "$env:USERPROFILE\Desktop\$Driver.sys"
$LogPath = "C:\KDAMonitor\logs\*.jsonl"

netsh wfp show state file=wfpstate_before.xml
Write-Host "--- Before load ---"
(Select-String -Path wfpstate_before.xml -Pattern "<name>KDAMonitor").Line

sc.exe stop $Driver | Out-Null
sc.exe delete $Driver | Out-Null

sc.exe create $Driver type= kernel binPath= $DriverPath
sc.exe start $Driver

netsh wfp show state file=wfpstate_after_load.xml
Write-Host "--- After load ---"
(Select-String -Path wfpstate_after_load.xml -Pattern "<name>KDAMonitor").Line

# --- Outbound traffic: TCP, ICMP and UDP ---
curl.exe -s -o NUL http://example.com
ping.exe -n 1 1.1.1.1
nslookup.exe example.com 1.1.1.1

# --- Inbound traffic: local listener and a connection to it ---
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, 8080)
$listener.Start()
$client = [System.Net.Sockets.TcpClient]::new("127.0.0.1", 8080)
$client.Close()
$listener.Stop()

Start-Sleep -Seconds 2

sc.exe stop $Driver

netsh wfp show state file=wfpstate_after_unload.xml
Write-Host "--- After unload ---"
(Select-String -Path wfpstate_after_unload.xml -Pattern "<name>KDAMonitor").Line

sc.exe delete $Driver

Write-Host "--- Network events ---"
$Log = Get-ChildItem $LogPath | Sort-Object LastWriteTime | Select-Object -Last 1
(Select-String -Path $Log.FullName -Pattern '"type":"Network"').Line |
    Where-Object { $_ -match 'curl\.exe|ping\.exe|nslookup\.exe|_port":8080' }
```

<video controls width="100%">
  <source src="demo-network-sensor.mp4" type="video/mp4">
</video>

Avant chargement, il n'y a aucune entrée `KDAMonitor`. Après chargement, on retrouve les six objets : le provider, le sublayer, les deux callouts et les deux filtres. Et enfin, après déchargement, plus aucune trace.

Côté journal, on retrouve la connexion TCP sortante de `curl.exe` vers `example.com`, les requêtes DNS de `nslookup.exe` en UDP, et la connexion vers notre listener vue des deux côtés, en sortant puis en entrant.

Le `ping` n'apparaît pas dans la sortie du script, car celle-ci filtre sur le nom des processus et que l'écho ICMP est attribué au processus `System` (PID 4) et non à `ping.exe`. On le retrouve en cherchant directement le protocole dans le journal :

```powershell
Get-ChildItem C:\KDAMonitor\logs\*.jsonl | Sort-Object LastWriteTime | Select-Object -Last 1 | Select-String -Pattern '"protocol":"ICMP"'
```

```json
{"id":179,"type":"Network","timestamp":134303323940213004,"pid":4,"process":"System","direction":"outbound","protocol":"ICMP","local_ip":"192.168.158.130","local_port":8,"remote_ip":"1.1.1.1","remote_port":0}
```

---

## Conclusion

Un troisième capteur de fait ! KDAMonitor journalise maintenant les processus, les chargements d'images et les connexions réseau. Il existe cependant des limites :

- **IPv6 n'est pas couvert.** Seules les couches `_V4` sont enregistrées.
- **Le filtre n'a aucune condition.** Tout le trafic IPv4 est capturé, ce qui produit beaucoup d'événements.
- **Le chemin du processus est au format NT** (`\Device\HarddiskVolume3\...`), tel que WFP le fournit.

Mais en soit je suis assez satisfait de l'état du projet jusqu'à aujourd'hui !

Voici l'architecture mise à jour :

![KDAMonitor architecture](kdamonitor_architecture.svg)

Merci d'avoir lu jusqu'au bout et à bientôt pour le prochain et neuvième article de cette série : **Surveillance de l'activité du registre**.
