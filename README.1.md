# Projet Docker — React, Express et PostgreSQL

Ce projet permet de lancer une application web complète avec Docker :

- un frontend React ;
- un backend Node.js / Express ;
- une base de données PostgreSQL ;
- un serveur Nginx pour servir le frontend en production locale.

Le frontend demande une instruction au backend, qui la récupère dans PostgreSQL.

Deux modes sont disponibles : développement et production locale.

## 1. Prérequis

Installer :

- Git ;
- Docker Desktop, avec les conteneurs Linux activés.

Démarrer Docker Desktop avant de commencer.

Il n’est pas nécessaire d’installer Node.js, npm ou PostgreSQL sur l’ordinateur.

Les commandes ci-dessous sont prévues pour PowerShell sous Windows. Elles doivent être exécutées à la racine du projet.

Vérifier que Docker fonctionne :

```powershell
docker info
docker compose version
```

Docker Compose 2.24.4 ou supérieur est nécessaire pour la syntaxe `!override`.

## 2. Télécharger le projet

```powershell
git clone [https://github.com/Kiting7/docker.git](https://github.com/Kiting7/docker.git)
cd docker
```

Si le projet a été téléchargé en ZIP, le décompresser et ouvrir un terminal dans le dossier contenant `compose.yaml`.

## 3. Préparer la configuration

### Créer le fichier .env

Depuis la racine :

```powershell
Copy-Item .env.example .env
```

Le fichier `.env` contient uniquement la configuration, sans mot de passe :

```dotenv
POSTGRES_DB=evaluation
POSTGRES_USER=postgres

APP_PORT=5173
HTTP_PORT=8080

IMAGE_PREFIX=docker-eval
APP_VERSION=1.0.0
```

Les valeurs par défaut permettent de lancer le projet sans modification.

### Créer le mot de passe PostgreSQL

À effectuer uniquement lors de la première installation :

```powershell
New-Item -ItemType Directory -Force secrets | Out-Null

$password = [guid]::NewGuid().ToString("N")
Set-Content -Encoding ascii -NoNewline secrets/db_password.txt $password
Remove-Variable password
```

Vérifier que le fichier existe et n’est pas vide :

```powershell
Get-Item secrets/db_password.txt |
    Select-Object Name, PSIsContainer, Length
```

Résultat attendu :

- `PSIsContainer` : `False` ;
- `Length` : supérieur à `0`.

Ne pas recréer ce mot de passe après l’initialisation de la base : modifier le fichier ne change pas automatiquement le mot de passe déjà enregistré dans PostgreSQL.

Le fichier `secrets/db_password.txt.example` sert uniquement de modèle et ne contient aucun vrai secret.

## 4. Démarrer en développement

```powershell
docker compose up -d --build
```

Cette commande utilise automatiquement :

- `compose.yaml` ;
- `compose.override.yaml`.

Vérifier les conteneurs :

```powershell
docker compose ps
```

Les trois services doivent devenir `healthy`.

Ouvrir l’application :

http://localhost:5173

En développement :

- Vite sert le frontend ;
- Node.js utilise le mode watch ;
- les dossiers `src` sont montés dans les conteneurs ;
- les dépendances restent installées dans les images.

Après modification des dépendances ou des fichiers de configuration, reconstruire :

```powershell
docker compose up -d --build
```

### Arrêter le développement

```powershell
docker compose down
```

Cette commande conserve les données PostgreSQL.

## 5. Démarrer en production locale

Arrêter d’abord la stack existante :

```powershell
docker compose down
```

Lancer la production locale :

```powershell
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```

Ouvrir :

http://localhost:8080

Dans ce mode :

- React est compilé ;
- Nginx sert les fichiers du frontend ;
- Nginx transmet les requêtes `/api` au backend ;
- les sources ne sont pas montées depuis l’ordinateur ;
- le backend démarre sans le mode watch.

Le fichier de développement n’est pas chargé, car les fichiers Compose sont sélectionnés explicitement avec `-f`.

Vérifier :

```powershell
docker compose -f compose.yaml -f compose.prod.yaml ps
```

### Arrêter la production locale

```powershell
docker compose -f compose.yaml -f compose.prod.yaml down
```

Ce mode simule une production sur l’ordinateur. Il ne comprend pas de configuration HTTPS ou de déploiement public.

## 6. Vérifier que l’application fonctionne

### En développement

```powershell
Invoke-RestMethod http://localhost:5173/api/health
Invoke-RestMethod http://localhost:5173/api/instruction
```

### En production locale

```powershell
Invoke-RestMethod http://localhost:8080/api/health
Invoke-RestMethod http://localhost:8080/api/instruction
```

La route `/api/health` doit répondre :

```json
{
  "status": "ok",
  "database": "up"
}
```

La route `/api/instruction` doit renvoyer une instruction avec les champs :

- `id` ;
- `message` ;
- `created_at`.

Le message doit également apparaître dans le navigateur.

Pour voir l’appel effectué par React :

1. ouvrir l’application ;
2. appuyer sur `F12` ;
3. ouvrir l’onglet Réseau / Network ;
4. recharger la page ;
5. vérifier que `/api/instruction` répond avec le statut `200`.

## 7. Architecture et réseaux

```text
Navigateur
    |
    v
Frontend Vite ou Nginx
    |
    | /api
    v
Backend Express
    |
    | SQL
    v
PostgreSQL
```

Deux réseaux sont utilisés :

| Service | front_net | back_net |
|---|---|---|
| Frontend | Oui | Non |
| Backend | Oui | Oui |
| PostgreSQL | Non | Oui |

Le réseau `back_net` est interne.

Seul le frontend publie un port sur l’ordinateur :

- `5173` en développement ;
- `8080` en production locale.

Les ports du backend et de PostgreSQL ne sont pas publiés.

### Vérifier les réseaux

En développement :

```powershell
$services = @("frontend", "backend", "db")

foreach ($service in $services) {
    $container = docker compose ps -q $service
    Write-Output "Service : $service"
    docker inspect $container --format '{{json .NetworkSettings.Networks}}'
}
```

Vérifier que la base est uniquement sur `back_net`.

Le nom des réseaux peut être précédé du nom du projet.

## 8. Vérifier la persistance des données

PostgreSQL utilise le volume nommé `db_data`, monté dans `/var/lib/postgresql`.

La procédure suivante s’effectue avec la stack de développement démarrée.

### Ajouter une donnée

Ouvrir PostgreSQL :

```powershell
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Dans le terminal SQL :

```sql
INSERT INTO instructions (message)
VALUES ('Test de persistance Docker');

SELECT id, message FROM instructions ORDER BY id;
```

Quitter :

```text
\q
```

### Recréer les conteneurs

```powershell
docker compose down
docker compose up -d
```

Attendre que les conteneurs soient `healthy`, puis rouvrir PostgreSQL :

```powershell
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Vérifier :

```sql
SELECT id, message
FROM instructions
WHERE message = 'Test de persistance Docker';
```

La ligne doit toujours exister.

Quitter avec `\q`.

Attention : `/api/instruction` renvoie seulement la première instruction. La nouvelle ligne n’apparaît donc pas forcément sur la page.

### Supprimer toutes les données

Uniquement pour une remise à zéro volontaire :

```powershell
docker compose down -v
```

Cette commande supprime le volume et ses données.

Le script `db/init.sql` n’est exécuté que lors de l’initialisation d’une base vide.

## 9. Secrets

Le vrai mot de passe est conservé dans :

```text
secrets/db_password.txt
```

Docker Compose le monte uniquement dans PostgreSQL et le backend :

```text
/run/secrets/db_password
```

- PostgreSQL utilise `POSTGRES_PASSWORD_FILE`.
- Le backend lit le fichier indiqué par `DB_PASSWORD_FILE`.
- Le frontend n’a pas accès au secret.

Les fichiers secrets locaux ne sont pas automatiquement chiffrés : ils doivent rester protégés et exclus de Git.

Vérifier que les fichiers sensibles ne sont pas suivis :

```powershell
git ls-files -- .env secrets/db_password.txt
```

Cette commande ne doit rien afficher.

Vérifier que Git les ignore :

```powershell
git check-ignore .env secrets/db_password.txt
```

Les fichiers `.example`, sans vrais identifiants, doivent rester versionnés.

## 10. Vérifier le non-root

En développement :

```powershell
docker compose exec backend id
docker compose exec frontend id
```

En production locale :

```powershell
docker compose -f compose.yaml -f compose.prod.yaml exec backend id
docker compose -f compose.yaml -f compose.prod.yaml exec frontend id
```

L’UID des services applicatifs doit être différent de `0`.

- Le backend utilise l’utilisateur `node`.
- Le frontend de production utilise une image Nginx non-root.

Pour vérifier les processus en production :

```powershell
docker compose -f compose.yaml -f compose.prod.yaml exec backend ps -o pid,user,args
docker compose -f compose.yaml -f compose.prod.yaml exec frontend ps -o pid,user,args
```

## 11. Dockerfiles et optimisations

### Backend

Trois stages :

- `base` : environnement commun et utilisateur non-root ;
- `development` : lancement avec rechargement automatique ;
- `production` : installation avec `npm ci --omit=dev` et lancement direct du serveur.

### Frontend

Quatre stages :

- `base` : installation des dépendances ;
- `development` : serveur Vite ;
- `build` : compilation de React ;
- `production` : Nginx avec uniquement les fichiers compilés.

L’image finale du frontend ne contient pas les outils Node.js utilisés pour le build.

### Optimisations

- Copie des fichiers `package*.json` avant le code pour réutiliser le cache des dépendances.
- Utilisation de `npm ci` avec les lockfiles.
- Images de base Alpine.
- Exclusion de `node_modules`, `dist`, des fichiers `.env` et des logs avec `.dockerignore`.
- Séparation des targets développement et production.
- Healthchecks sur les trois services.
- Attente de PostgreSQL avant le backend, puis du backend avant le frontend.

## 12. Build AMD64 et ARM64

Les commandes suivantes construisent les images pour :

- `linux/amd64` ;
- `linux/arm64`.

### Préparer le builder

Une seule fois :

```powershell
docker buildx create --name multiarch --driver docker-container --use
docker buildx inspect --bootstrap
```

Si le builder existe déjà :

```powershell
docker buildx use multiarch
docker buildx inspect --bootstrap
```

Docker Desktop fournit l’émulation nécessaire. Sur Linux sans Docker Desktop, une configuration d’émulation peut être nécessaire.

### Construire le backend

```powershell
docker buildx build --platform linux/amd64,linux/arm64 --target production -t docker-eval-backend:1.0.0 --output type=oci,dest=backend-multiarch.tar ./backend
```

### Construire le frontend

```powershell
docker buildx build --platform linux/amd64,linux/arm64 --target production -t docker-eval-frontend:1.0.0 --output type=oci,dest=frontend-multiarch.tar ./frontend
```

Les deux commandes doivent terminer sans erreur.

Les archives produites ne sont pas automatiquement chargées dans Docker Compose.

Ajouter au `.gitignore` :

```gitignore
*-multiarch.tar
```

Un build réussi valide la construction pour les deux architectures. Un test de fonctionnement sur ARM64 nécessite également un lancement et des tests HTTP sur cette architecture, physiquement ou sous émulation.

## 13. Publication sur GHCR et versioning

Cette partie est facultative pour démarrer le projet.

Le registry prévu est GitHub Container Registry.

### Tags utilisés

- `1.0.0` : version précise ;
- `1.0` : dernière version de la branche mineure ;
- `latest` : dernière version stable ;
- `sha-<commit>` : lien avec le commit Git.

Ne pas réutiliser un tag de version précise pour un autre contenu.

### Utiliser les images publiées

Après publication, mettre dans `.env` :

```dotenv
IMAGE_PREFIX=ghcr.io/kiting7/docker
APP_VERSION=1.0.0
```

Puis :

```powershell
docker compose -f compose.yaml -f compose.prod.yaml pull
docker compose -f compose.yaml -f compose.prod.yaml up -d --no-build
```

La configuration locale et le fichier secret restent nécessaires.


## 14. Dépannage

### Docker ne répond pas

Démarrer Docker Desktop, attendre son initialisation, puis vérifier :

```powershell
docker info
```

### Aucun fichier Compose trouvé

Se placer dans le dossier contenant `compose.yaml` :

```powershell
Get-Location
Get-ChildItem compose*
```

### Port déjà utilisé

Modifier le port concerné dans `.env` :

```dotenv
APP_PORT=5174
HTTP_PORT=8081
```

Relancer la stack et utiliser le nouveau port dans le navigateur.

### PostgreSQL ou le backend ne démarre pas

```powershell
docker compose ps -a
docker compose logs --tail=100 db backend
```

Vérifier :

- que le secret est un fichier non vide ;
- que `.env` existe ;
- que le mot de passe n’a pas été modifié après initialisation.

Ne pas supprimer le volume sans accepter la perte des données.

En production, ajouter `-f compose.yaml -f compose.prod.yaml` après `docker compose`.

### Le build ARM64 échoue

Vérifier le builder et ses plateformes :

```powershell
docker buildx ls
docker buildx inspect --bootstrap
```

Relancer le build avec `--progress=plain` pour obtenir des logs détaillés.

