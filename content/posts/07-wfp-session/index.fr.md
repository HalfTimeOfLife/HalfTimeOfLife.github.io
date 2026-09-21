---
title: "07 - Préparation de la surveillance réseau : mise en place de la session WFP"
date: 2026-09-21
draft: false
description: "Mise en place de la session WFP (provider, sublayer) de KDAMonitor."
summary: "Mise en place de la session WFP (provider, sublayer) de KDAMonitor."
series: ["KDAMonitor"]
series_order: 7
tags:
  - KDAMonitor
  - Windows Kernel
  - Kernel Driver
  - C
---

Bienvenue dans le septième article de la série sur le développement de KDAMonitor !

Dans cet article, je vais couvrir la version v0.7 de ce projet. Cette version ne filtre encore aucun trafic réseau, elle met en place l'infrastructure WFP (provider, sublayer) sur laquelle viendra s'accrocher le capteur réseau de la v0.8. Une section de cet article va contenir le deuxième crash que j'ai rencontré.

Voici les fichiers concernés par cet article, et la section qui les explique :

| Fichier | Rôle | Section |
| --- | --- | --- |
| `wfp_session.h` | GUIDs provider/sublayer, déclarations | [Implémenter la session WFP](#implémenter-la-session-wfp) |
| `wfp_session.c` | Ouverture de l'engine, ajout provider/sublayer, cleanup | [Implémenter la session WFP](#implémenter-la-session-wfp) |
| `driver_entry.c` | Intégration dans DriverEntry/DriverUnload | [Intégration dans `driver_entry.c`](#intégration-dans-driver_entryc) |
| `device.c` / `driver_entry.c` | Crash #2 (`PAGE_FAULT_IN_NONPAGED_AREA`) et son fix | [Crash #2 : le device object supprimé deux fois](#crash-2--le-device-object-supprimé-deux-fois) |

> Le projet peut être retrouvé dans ce dépôt : [KDAMonitor](https://github.com/HalfTimeOfLife/KDAMonitor).

---

## WFP en bref

Comme indiqué par la documentation microsoft, la [Windows Filtering Platform](https://learn.microsoft.com/en-us/windows/win32/fwp/windows-filtering-platform-start-page) est un ensemble d'API et de services permettant de filtrer le trafic réseau.

Pour ouvrir une session de filtrage, on utilise `FwpmEngineOpen` qui établit la connexion avec le moteur WFP. Une fois la session ouverte, on peut déclarer un *provider* avec `FwpmProviderAdd`. Un provider est l'identité de l'application (ou driver) auprès du moteur WFP. Il permet, par exemple, d'interagir directement avec les objets, tels que les *sublayers*, enregistrés par KDAMonitor.

Les *sublayers* sont des espaces reservés qui permettent de stocker les filtres et le callout réseau de KDAMonitor (prévu pour la v0.8). Pour cette version, on se contente d'ouvrir la session et d'enregistrer le provider et le sublayer. Donc pour l'instant, aucun callout ou filtre.

---

## Implémenter la session WFP

Avant de commencer la partie concrète du code, il faut d'abord définir des GUIDs, leurs noms et descriptions, nous en avons besoin de deux :

- pour le provider :

```c
DEFINE_GUID(KDAMON_WFP_PROVIDER_GUID,
    0x16821234, 0xd300, 0x42f1,
    0xbc, 0xe8, 0xd2, 0x23, 0x1a, 0xf3, 0x25, 0xc3);
#define KDAMON_WFP_PROVIDER_NAME    L"KDAMonitor Provider"
#define KDAMON_WFP_PROVIDER_DESCRIPTION L"KDAMonitor - Kernel Driver Activity Monitor"

```

- et pour le sublayer :

```c
DEFINE_GUID(KDAMON_WFP_SUBLAYER_GUID,
    0xa141444c, 0x7f15, 0x4a05,
    0xa2, 0x95, 0x07, 0xca, 0x38, 0xc2, 0x3c, 0xb1);
#define KDAMON_WFP_SUBLAYER_NAME    L"KDAMonitor Sublayer"
#define KDAMON_WFP_SUBLAYER_DESCRIPTION L"KDAMonitor sublayer for network event monitoring"
```

> Pour utiliser la macro `DEFINE_GUID`, il faut commencer le fichier par `INITGUID`.

On définit aussi un *handle* pour le moteur (`HANDLE g_EngineHandle`) qui représente la connexion avec le moteur WFP. La fonction `NTSTATUS KdaMonWfpSessionInit(void)` se charge d'ouvrir la connexion avec le moteur WFP, puis d'enregistrer le provider et le sublayer de KDAMonitor. On commence par déclarer les structures utilisées par les trois étapes avant d'ouvrir la session avec `FwpmEngineOpen` :

```c
NTSTATUS status;
FWPM_SESSION wfpSession = { 0 };
FWPM_PROVIDER provider = { 0 };
FWPM_SUBLAYER subLayer = { 0 };

status = FwpmEngineOpen(NULL, RPC_C_AUTHN_WINNT, NULL, &wfpSession, &g_EngineHandle);
if (status != STATUS_SUCCESS)
{
	KdPrint((DRIVER_TAG " [ERROR]: FwpmEngineOpen failed with status 0x%X\n", status));
	return STATUS_UNSUCCESSFUL;
}
```

On enregistre ensuite le *provider* avec `FwpmProviderAdd`:

```c
provider.providerKey = KDAMON_WFP_PROVIDER_GUID;
provider.displayData.name = KDAMON_WFP_PROVIDER_NAME;
provider.displayData.description = KDAMON_WFP_PROVIDER_DESCRIPTION;
provider.flags = 0;
provider.serviceName = NULL;
status = FwpmProviderAdd(g_EngineHandle, &provider, NULL);
if (status != STATUS_SUCCESS)
{
	KdPrint((DRIVER_TAG " [ERROR]: FwpmProviderAdd failed with status 0x%X\n", status));
	FwpmEngineClose(g_EngineHandle);
	g_EngineHandle = NULL;
	return STATUS_UNSUCCESSFUL;
}
```

`providerKey` et `displayData` (nom + description) identifient le provider auprès du moteur WFP, et dans des outils comme netsh wfp show providers. `serviceName` reste à NULL car le provider n'est pas rattaché à un service Windows en particulier.

Et enfin le *sublayer* avec `FwpmSubLayerAdd` :

```c
subLayer.subLayerKey = KDAMON_WFP_SUBLAYER_GUID;
GUID providerKey = KDAMON_WFP_PROVIDER_GUID;
subLayer.providerKey = &providerKey;
subLayer.displayData.name = KDAMON_WFP_SUBLAYER_NAME;
subLayer.displayData.description = KDAMON_WFP_SUBLAYER_DESCRIPTION;
subLayer.flags = 0;
subLayer.weight = (UINT16)0;
status = FwpmSubLayerAdd(g_EngineHandle, &subLayer, NULL);
if (status != STATUS_SUCCESS)
{
	KdPrint((DRIVER_TAG " [ERROR]: FwpmSubLayerAdd failed with status 0x%X\n", status));
	FwpmProviderDeleteByKey(g_EngineHandle, &KDAMON_WFP_PROVIDER_GUID);
	FwpmEngineClose(g_EngineHandle);
	g_EngineHandle = NULL;
	return STATUS_UNSUCCESSFUL;
}

return STATUS_SUCCESS;
```

`subLayer.providerKey` relie le sublayer au provider créé juste avant. `weight` définit la priorité relative entre sublayers, ce paramètre est sans importance tant qu'un seul sublayer existe.

À chaque étape, un échec défait ce que l'étage précédent a construit, dans l'ordre inverse : si `FwpmProviderAdd` échoue, on referme simplement la session avec `FwpmEngineClose` ; si `FwpmSubLayerAdd` échoue, on va un cran plus loin en supprimant d'abord le provider fraîchement créé (`FwpmProviderDeleteByKey`) avant de refermer la session.

Pour nettoyer/supprimer la session WFP, on fait appel à `VOID KdaMonWfpSessionCleanup(void)` qui est le symétrique de `KdaMonWfpSessionInit` et va donc supprimer le *sublayer* (`FwpmSubLayerDeleteByKey`), supprimer le *provider* (`FwpmProviderDeleteByKey`), fermer le moteur WFP (`FwpmEngineClose`) et remettre le *handle* du moteur à `NULL` (`g_EngineHandle`) :

```c
VOID KdaMonWfpSessionCleanup(void)
{
	NTSTATUS status;
	if (g_EngineHandle == NULL)
		return;

	status = FwpmSubLayerDeleteByKey(g_EngineHandle, &KDAMON_WFP_SUBLAYER_GUID);
	if (status != STATUS_SUCCESS)
	{
		KdPrint((DRIVER_TAG " [ERROR]: FwpmSubLayerDeleteByKey failed with status 0x%X\n", status));
	}

	status = FwpmProviderDeleteByKey(g_EngineHandle, &KDAMON_WFP_PROVIDER_GUID);
	if (status != STATUS_SUCCESS)
	{
		KdPrint((DRIVER_TAG " [ERROR]: FwpmProviderDeleteByKey failed with status 0x%X\n", status));
	}

	status = FwpmEngineClose(g_EngineHandle);
	if (status != STATUS_SUCCESS)
	{
		KdPrint((DRIVER_TAG " [ERROR]: FwpmEngineClose failed with status 0x%X\n", status));
	}

	g_EngineHandle = NULL;

	KdPrint((DRIVER_TAG " [SUCCESS]: WFP session closed successfully\n"));
}
```

---

## Intégration dans `driver_entry.c`

Dans le code, l'initialisation de la session WFP sera faite entre l'initialisation du *device* et de la file, la session WFP n'étant pas un capteur, elle est placée au début.

L'ordre d'initialisation dans `DriverEntry` sera donc :

- le *device*
- la session WFP
- la file
- le *log writer*
- et les callbacks (processus et image)

On ajoute donc cela à la fonction :

```c
	// --- Initialize WFP session ---
	status = KdaMonWfpSessionInit();
	if (!NT_SUCCESS(status))
	{
		KdPrint((DRIVER_TAG " [ERROR]: KdaMonWfpSessionInit failed\n"));
		goto cleanup_device;
	}
```

La destruction de ces éléments dans `DriverUnload` se fait dans l'ordre inverse. Voici donc les deux fonctions complètes :

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

	// --- Cleanup WFP session ---
	KdaMonWfpSessionCleanup();
	
	// --- Delete device object ---
	KdaMonDeleteDevice(&g_DeviceObject);
	KdPrint((DRIVER_TAG " [INFO]: Driver Unload complete\n"));
}

NTSTATUS DriverEntry(_In_ PDRIVER_OBJECT DriverObject, _In_ PUNICODE_STRING RegistryPath)
{
	UNREFERENCED_PARAMETER(RegistryPath);

	KdPrint((DRIVER_TAG " [INFO]: DriverEntry begin\n"));
	NTSTATUS status;

	DriverObject->DriverUnload = DriverUnload;
	DriverObject->MajorFunction[IRP_MJ_CREATE] = KdaMonCreateClose;
	DriverObject->MajorFunction[IRP_MJ_CLOSE] = KdaMonCreateClose;
	DriverObject->MajorFunction[IRP_MJ_DEVICE_CONTROL] = KdaMonDeviceControl;

	// --- Create device object ---
	status = KdaMonCreateDevice(DriverObject, &g_DeviceObject);
	if (!NT_SUCCESS(status))
	{
		goto cleanup_none;
	}

	// --- Initialize WFP session ---
	status = KdaMonWfpSessionInit();
	if (!NT_SUCCESS(status))
	{
		KdPrint((DRIVER_TAG " [ERROR]: KdaMonWfpSessionInit failed\n"));
		goto cleanup_device;
	}
	
	// --- Initialize the event queue ---
	if (!KdaMonEventQueueInitialize())
	{
		KdPrint((DRIVER_TAG " [ERROR]: EventQueueInitialize failed\n"));
		status = STATUS_UNSUCCESSFUL;
		goto cleanup_wfp;
	}

	// --- Start the log writer thread ---
	if (!KdaMonLogWriterStart(DriverObject))
	{
		KdPrint((DRIVER_TAG " [ERROR]: KdaMonLogWriterStart failed\n"));
		status = STATUS_UNSUCCESSFUL;
		goto cleanup_queue;
	}

	// --- Register process creation callback ---
	status = KdaMonProcessCallbackRegister();
	if (!NT_SUCCESS(status))
	{
		KdPrint((DRIVER_TAG " [ERROR]: KdaMonProcessCallbackRegister failed\n"));
		goto cleanup_logwriter;
	}

	// --- Register image load callback ---
	status = KdaMonImageCallbackRegister();
	if (!NT_SUCCESS(status))
	{
		KdPrint((DRIVER_TAG " [ERROR]: KdaMonImageCallbackRegister failed\n"));
		goto cleanup_process;
	}

	KdPrint((DRIVER_TAG " [SUCCESS]: Initialized successfully\n"));
	return STATUS_SUCCESS;

cleanup_process:
	KdaMonProcessCallbackUnregister();
cleanup_logwriter:
	KdaMonLogWriterStop();
cleanup_queue:
	KdaMonEventQueueDestroy();
cleanup_wfp:
	KdaMonWfpSessionCleanup();
cleanup_device:
	KdaMonDeleteDevice(&g_DeviceObject);
cleanup_none:
	return status;
}
```

> La structure de nettoyage des objets en cas d'échec d'initialisation dans `DriverEntry` de la version précédente a été modifiée afin d'utiliser des goto qui rend le code bien plus propre.

---

## Crash #2 : le device object supprimé deux fois

### Contexte

Ce crash est apparu en testant le refactor de `DriverEntry` présenté plus haut. Le *dump* est conservé dans le repo au sein du fichier `docs/dumps/2_PAGE_FAULT_IN_NONPAGED_AREA.dmp`.

Le bugcheck relevé est `PAGE_FAULT_IN_NONPAGED_AREA (0x50)`, avec un accès en lecture (`Arg2 = 0`) à une adresse invalide. L'instruction fautive se trouve dans `nt!ObQueryNameStringMode`, appelée depuis `nt!IoDeleteDevice`, elle-même appelée depuis `KdaMonDeleteDevice` (`device.c`) dans `DriverUnload` (`driver_entry.c`) :

```text
nt!ObQueryNameStringMode+a8
fffff802`7a369ad8 488b81a0000000  mov     rax,qword ptr [rcx+0A0h]
```

`IoDeleteDevice` appelle en interne `ObQueryNameString` pour résoudre le nom de l'objet avant de le supprimer — ici, sur un `DEVICE_OBJECT` déjà libéré.

### Diagnostic

Le code fautif se trouvait dans `DriverEntry`, à qui il manquait un `return STATUS_SUCCESS;` juste après le log de succès :

```c
	KdPrint((DRIVER_TAG " [SUCCESS]: Initialized successfully\n"));
	// il manque : return STATUS_SUCCESS;
cleanup_process:
	KdaMonProcessCallbackUnregister();
cleanup_wfp:
	KdaMonWfpSessionCleanup();
cleanup_logwriter:
	KdaMonLogWriterStop();
cleanup_queue:
	KdaMonEventQueueDestroy();
cleanup_device:
	KdaMonDeleteDevice(g_DeviceObject);
cleanup_none:
	return status; // le driver arrive là même sans erreur !
```

Sans ce `return`, l'exécution tombait directement dans la cascade de cleanup même après une initialisation réussie avant de renvoyer `STATUS_SUCCESS`.

`KdaMonDeleteDevice` recevait `g_DeviceObject` **par valeur**. Elle pouvait donc libérer le `DEVICE_OBJECT`, mais pas mettre `g_DeviceObject` à `NULL`.

Ainsi, après le premier appel, `g_DeviceObject` contenait toujours l'adresse de l'objet désormais libéré (*dangling pointer*).

Lors du déchargement, `DriverUnload` appelait de nouveau `KdaMonDeleteDevice(g_DeviceObject)`, qui tentait alors d'utiliser ce pointeur invalide, provoquant le crash.


### Résolution

Le correctif intervient à deux niveaux :

- le `return status;` manquant, ajouté juste après le log de succès
- et `KdaMonDeleteDevice` qui prend désormais un `PDEVICE_OBJECT*` et remet le pointeur de l'appelant à `NULL` après suppression, en renfort contre un futur double-cleanup :

```c
void KdaMonDeleteDevice(_Inout_ PDEVICE_OBJECT* DeviceObject)
{
	UNICODE_STRING symLink = RTL_CONSTANT_STRING(KDAMON_SYMLINK_NAME);
	IoDeleteSymbolicLink(&symLink);

	if (*DeviceObject != NULL)
	{
		IoDeleteDevice(*DeviceObject);
		*DeviceObject = NULL;
	}
	...
}
```

Les appelants passent désormais `&g_DeviceObject` plutôt que `g_DeviceObject`.

---

## Validation

Pour cette version, la validation consiste à vérifier que le provider et le sublayer de KDAMonitor apparaissent bien dans l'état du moteur WFP après le chargement du driver, et disparaissent après son déchargement. Pour cela, j'ai utilisé `netsh wfp show state` avant, pendant, et après le cycle de vie du driver, à l'aide du script suivant (`test_v07.ps1`) :

```powershell
# test_v07.ps1

$Driver = "KDAMonitor"
$DriverPath = "$env:USERPROFILE\Desktop\$Driver.sys"

netsh wfp show state file=wfpstate_before.xml

sc.exe stop $Driver
sc.exe delete $Driver

sc.exe create $Driver type= kernel binPath= $DriverPath
sc.exe start $Driver

netsh wfp show state file=wfpstate_after_load.xml

sc.exe stop $Driver

netsh wfp show state file=wfpstate_after_unload.xml

sc.exe delete $Driver
```

Avant chargement, aucune entrée `KDAMonitor` :

![Validation avant chargement](wfpstate_before.png)

Après chargement, le provider et le sublayer apparaissent bien dans l'état du moteur WFP :

![Validation après chargement](wfpstate_after_load.png)

Et après déchargement, plus aucune trace des deux :

![Validation après déchargement](wfpstate_after_unload.png)

---

## Conclusion

Dans cette version, la session WFP a été ouverte, le provider et le sublayer de KDAMonitor enregistrés, en attente du premier filtre.

> Bien que cette version n'ait pas été très intéressante (un peu ennuyeuse :)), elle est nécessaire pour la partie que je trouve la plus intéressante : le capteur réseau.

![KDAMonitor architecture](kdamonitor_architecture.svg)

Merci d'avoir lu jusqu'au bout et à bientôt pour le prochain et huitième article de cette série : **Surveillance des connexions réseau avec la Windows Filtering Platform**.
