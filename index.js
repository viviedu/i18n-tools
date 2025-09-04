const dotenv = require('dotenv');
const fs = require('fs').promises;

// Fixes fetch import for node 18+, but also backwards compatible
const fetch = globalThis.fetch ?? ((...args) =>
  import('node-fetch').then(({ default: f }) => f(...args)));

const { SourceFiles, Translations, UploadStorage } = require('@crowdin/crowdin-api-client');
const path = require('path');

dotenv.config();

// Our language files always have the region lang-region but when we
// ask crowdin to pre-translate they use languages without region in some cases.
// You can see on the dashboard for locales by looking at the url. For example:
// client en-US <- crowdin.com/project/client/en-US
// client de-DE <- crowdin.com/project/client/de
// client pt-PT <- crowdin.com/project/client/pt-PT
// or the official api https://developer.crowdin.com/api/v2/#operation/api.languages.getMany has the 'ids'.
const defaultMapCrowdinLocale = {
  de: 'de-DE',
  'pt-PT': 'pt-PT'
};

// crowdinFileId. id of the file we have already uploaded to crowdin can be found with
// curl -X GET "https://api.crowdin.com/api/v2/projects/{{project_id}}/files" -H "Authorization: Bearer $CROWDIN_TOKEN" -H "Content-Type: application/json"

async function crowdInPretranslate({
  crowdinFileId,
  crowdinProjectId,
  uploadFilePath = 'src/assets/i18n/en-GB.json',
  translationsFolder = 'src/assets/i18n/lang',
  storageFilename,
  aiPromptId = 78309,
  mapCrowdinLocale = defaultMapCrowdinLocale
}) {
  const { CROWDIN_TOKEN } = process.env;

  if (!CROWDIN_TOKEN) {
    throw new Error('CROWDIN_TOKEN not set!');
  }

  const config = {
    token: CROWDIN_TOKEN
    };

  const crowdinLocales = Object.keys(mapCrowdinLocale);
  const data = await fs.readFile(uploadFilePath, 'utf8');
  const sourceFiles = new SourceFiles(config);
  const translations = new Translations(config);
  const uploadStorage = new UploadStorage(config);

  console.log(`uploading: ${uploadFilePath}`);

  const uploadResponse = await uploadStorage.addStorage(storageFilename, data);
  await sourceFiles.updateOrRestoreFile(crowdinProjectId, crowdinFileId, { storageId: uploadResponse.data.id });

  const preTranslationBody = {
    languageIds: crowdinLocales,
    fileIds: [
      crowdinFileId
    ],
    method: 'ai',
    aiPromptId,
    autoApproveOption: 'none',
    duplicateTranslations: false,
    skipApprovedTranslations: false,
    translateUntranslatedOnly: true,
    translateWithPerfectMatchOnly: false
  };

  const preTranslationResponse = await translations.applyPreTranslation(crowdinProjectId, preTranslationBody);
  const preTranslationId = preTranslationResponse.data.identifier;

  while (true) {
    const translationProgress = await translations.preTranslationStatus(crowdinProjectId, preTranslationId);
    console.log('pre translation progress:', translationProgress.data.progress);
    if (translationProgress.data.status === 'finished') {
      console.log('pre translation finished');
      break;
    } else if (translationProgress.data.status !== 'in_progress' && translationProgress.data.status !== 'created') {
      console.error('error with pre translation, status:', translationProgress.data.status);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  for (const locale of crowdinLocales) {
    const buildBody = {
      targetLanguageId: locale,
      exportAsXliff: false,
      skipUntranslatedStrings: false,
      skipUntranslatedFiles: false,
      exportApprovedOnly: false
    };

    const buildResponse = await translations.buildProjectFileTranslation(crowdinProjectId, crowdinFileId, buildBody);

    const fileResponse = await fetch(buildResponse.data.url);
    const file = await fileResponse.text();

    const mappedLocale = mapCrowdinLocale[locale];
    const translationExt = path.extname(uploadFilePath); // .json or .yaml
    const translatedFilePath = `${translationsFolder}/${mappedLocale}${translationExt}`;

    console.log(`writing: ${translatedFilePath}`);

    try {
      await fs.writeFile(`${translatedFilePath}`, file);
    } catch (error) {
      console.error(`failed to write ${translatedFilePath}`);
    }
  }
}


function listKeys(obj) {
  return Object.keys(obj);
}

// For each locale, get the list of keys it contains (Assuming flat object)
async function getIntlKeys(locales) {
  const results = {};

  for (const locale of locales) {
    const localeFile = await fs.readFile(locale, 'utf8');
    const content = JSON.parse(localeFile);
    results[locale] = listKeys(content); // Directly assign the keys to results
  }

  return results;
}

// Build full path of filenames
async function getLocaleFiles(translationDir) {
  const fileNames = await fs.readdir(translationDir);
  const locales = fileNames.map(file => path.join(translationDir, file));
  return locales;
}

async function checkMissingI18nKeys({
  baseLocalePath = 'src/assets/i18n/en-GB.json',
  translationDir = 'src/assets/i18n/lang-compiled'
}) {
  const locales = await getLocaleFiles(translationDir);

  const baseLocaleFile = await fs.readFile(baseLocalePath, 'utf8');
  const baseLocaleKeys = listKeys(JSON.parse(baseLocaleFile));

  const translationKeys = await getIntlKeys(locales);

  let hasError = false;
  // Compare base keys with translation keys and log missing entries
  Object.entries(translationKeys).forEach(([locale, keys]) => {
    const missingKeys = baseLocaleKeys.filter(key => !keys.includes(key));
    if (missingKeys.length > 0) {
      missingKeys.forEach(missingKey => {
        console.error(`"${missingKey}" missing from locale: ${path.basename(locale)}`);
      });
      hasError = true;
    } else {
      console.log(`No missing keys in ${path.basename(locale)}. All good!`);
    }
  });

  if (hasError) {
    process.exit(1);
  }
}

module.exports = { crowdInPretranslate, checkMissingI18nKeys };
