/* eslint-disable no-console */

const fs = require('node:fs').promises;

const { SourceFiles, Translations, UploadStorage } = require('@crowdin/crowdin-api-client');
const dotenv = require('dotenv');

dotenv.config();

const crowdinFileId = 42;
// id of the file we have already uploaded to crowdin can be found with
// curl -X GET "https://api.crowdin.com/api/v2/projects/{{project_id}}/files" -H "Authorization: Bearer $CROWDIN_TOKEN" -H "Content-Type: application/json"


const crowdinProjectId = 654680; // the project id can be found in the api tab of the project https://crowdin.com/project/vivi-box/tools/api
const uploadFilePath = 'src/assets/i18n/en-GB.json';
const translationsFolder = 'src/assets/i18n/lang';
const storageFilename = 'en-GB.json';
const engineId = 443920; // the translation engine on Alysanders account

// Our language files always have the region lang-region but when we
// ask crowdin to pre-translate they use languages without region in some cases.
// You can see on the dashboard for locales by looking at the url. For example:
// client en-US <- crowdin.com/project/vivi-client/en-US
// client de-DE <- crowdin.com/project/vivi-client/de
// client pt-PT <- crowdin.com/project/vivi-client/pt-PT
// or the official api https://developer.crowdin.com/api/v2/#operation/api.languages.getMany has the 'ids'.

const mapCrowdinToClientLocale = {
  de: 'de-DE',
  'pt-PT': 'pt-PT'
};


async function main(token) {
  const crowdinLocales = Object.keys(mapCrowdinToClientLocale);

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

    const mappedLocale = mapCrowdinToClientLocale[locale];

    const translatedFilePath = `${translationsFolder}/${mappedLocale}.json`;

    console.log(`writing: ${translatedFilePath}`);

    try {
      await fs.writeFile(`${translatedFilePath}`, file);
    } catch (error) {
      console.error(`failed to write ${translatedFilePath}`);
    }
  }
}

const { CROWDIN_TOKEN } = process.env;

if (!CROWDIN_TOKEN) {
  throw new Error('CROWDIN_TOKEN not set!');
} else {
  main(CROWDIN_TOKEN);
}
