/* eslint-disable no-console */

const fs = require('node:fs').promises;
const { SourceFiles, Translations, UploadStorage } = require('@crowdin/crowdin-api-client');
const path = require('path');

const defaultMapCrowdinLocale = {
  de: 'de-DE',
  'pt-PT': 'pt-PT'
};

async function pretranslate({
    token,
    crowdinFileId,
    crowdinProjectId = 654680,
    uploadFilePath = 'src/assets/i18n/en-GB.json',
    translationsFolder = 'src/assets/i18n/lang',
    storageFilename,
    engineId = 443920,
    mapCrowdinLocale = defaultMapCrowdinLocale
  }) {
  const crowdinLocales = Object.keys(mapCrowdinLocale);

  const config = {
    token
  };

  const translations = new Translations(config);
  const sourceFiles = new SourceFiles(config);
  const uploadStorage = new UploadStorage(config);
  const data = await fs.readFile(uploadFilePath, 'utf8');

  console.log(`uploading: ${uploadFilePath}`);

  const uploadResponse = await uploadStorage.addStorage(storageFilename, data);
  await sourceFiles.updateOrRestoreFile(crowdinProjectId, crowdinFileId, { storageId: uploadResponse.data.id });

  const preTranslationBody = {
    languageIds: crowdinLocales,
    fileIds: [
      crowdinFileId
    ],
    method: 'mt', // machine translation
    engineId,
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
    const translationExt = path.extname(uploadFilePath); // json or yaml
    const translatedFilePath = `${translationsFolder}/${mappedLocale}.${translationExt}`;

    console.log(`writing: ${translatedFilePath}`);

    try {
      await fs.writeFile(`${translatedFilePath}`, file);
    } catch (error) {
      console.error(`failed to write ${translatedFilePath}`);
    }
  }
}

module.exports = { pretranslate };
