// Copyright (C) 2017-2021 BinaryMist Limited. All rights reserved.

// This file is part of PurpleTeam.

// PurpleTeam is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation version 3.

// PurpleTeam is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this PurpleTeam project. If not, see <https://www.gnu.org/licenses/>.

const Joi = require('joi');
const got = require('got');
const { HttpProxyAgent } = require('hpagent');

const config = require(`${process.cwd()}/config/config`); // eslint-disable-line import/no-dynamic-require

const internals = {
  zApSchema: Joi.object({
    protocol: Joi.string().required().valid('https', 'http'),
    hostname: Joi.string().required(),
    port: Joi.number().required().port(),
    apiKey: Joi.string().required(),
    apiFeedbackSpeed: Joi.number().integer().positive(),
    reportDir: Joi.string().required().valid(config.get('emissary.report.dir')),
    reportFormats: Joi.array().default(config.get('emissary.report.formats')),
    uploadDir: Joi.string().required().valid(config.get('emissary.upload.dir')),
    spider: Joi.object({
      maxDepth: Joi.number().integer().positive(),
      threadCount: Joi.number().integer().min(0).max(20),
      maxChildren: Joi.number().integer().min(0).max(20)
    })
  }),
  log: undefined,
  publisher: undefined,
  properties: undefined,
  alertCount: undefined,
  // String substitutions (Ex: %ip ) are replaced in sut.js
  // String substitutions must be in the format %sut[[.property].path] preceded immediately and followed immediately by a space
  //   unless it's the first or last word in the message.
  // Multiple string substitutions are Allowed.
  // Array elements can also be substituted. Ex: %testRoutes.1.attributes.attackFields.0.value
  knownZapErrorsWithHelpMessageForBuildUser: [
    {
      zapMessage: 'ZAP Error [java.net.UnknownHostException]: %ip', // Notice the space before the '%'
      helpMessageForBuildUser: 'Are you sure you specified the correct sutIp ( %ip ) in your Job and that the sutIp you are targeting is in fact up?' // Notice the space immediately before the '%' and immediately after the substitution.
    }
    // ,{ More errors with help messages... as we find out about them }
  ],
  reportFilePath: undefined
};

internals.validateProperties = (emissaryProperties) => {
  const { zApSchema, log } = internals;
  const result = zApSchema.validate(emissaryProperties);
  // log.debug(`result: ${JSON.stringify(result)}`);
  if (result.error) {
    log.error(result.error.message, { tags: [`pid-${process.pid}`, 'zAp'] });
    throw new Error(result.error.message);
  }
  return result.value;
};

internals.initZapApi = ({ aPiKey, proxy }) => {
  internals.zApApi = got.extend({
    headers: { 'X-ZAP-API-Key': aPiKey },
    agent: {
      http: new HttpProxyAgent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 256,
        maxFreeSockets: 256,
        scheduling: 'lifo',
        proxy
      })
    },
    responseType: 'json',
    resolveBodyOnly: true,
    prefixUrl: 'http://zap/'
  });
};

const getProperties = (selecter) => {
  const { properties } = internals;
  if (typeof selecter === 'string') return properties[selecter];
  if (Array.isArray(selecter)) return selecter.reduce((accum, propertyName) => ({ ...accum, [propertyName]: properties[propertyName] }), {});
  return properties;
};

/* eslint-disable */
internals.zApApiRoutes = {
  ascan: {
    disableAllScanners:           async (params) => internals.zApApi('JSON/ascan/action/disableAllScanners/',               { searchParams: new URLSearchParams(params) }),
    disableScanners:              async (params) => internals.zApApi('JSON/ascan/action/disableScanners/',                  { searchParams: new URLSearchParams(params) }),
    enableAllScanners:            async (params) => internals.zApApi('JSON/ascan/action/enableAllScanners/',                { searchParams: new URLSearchParams(params) }),
    scan:                         async (params) => internals.zApApi('JSON/ascan/action/scan/',                             { searchParams: new URLSearchParams(params) }),    
    setScannerAlertThreshold:     async (params) => internals.zApApi('JSON/ascan/action/setScannerAlertThreshold/',         { searchParams: new URLSearchParams(params) }),
    setScannerAttackStrength:     async (params) => internals.zApApi('JSON/ascan/action/setScannerAttackStrength/',         { searchParams: new URLSearchParams(params) }),
    viewScanners:                 async (params) => internals.zApApi('JSON/ascan/view/scanners/',                           { searchParams: new URLSearchParams(params) }),
    viewStatus:                   async (params) => internals.zApApi('JSON/ascan/view/status/',                             { searchParams: new URLSearchParams(params) })
    
  },
  authentication: {
    setAuthenticationMethod:      async (params) => internals.zApApi('JSON/authentication/action/setAuthenticationMethod/', { searchParams: new URLSearchParams(params) }),
    setLoggedInIndicator:         async (params) => internals.zApApi('JSON/authentication/action/setLoggedInIndicator/',    { searchParams: new URLSearchParams(params) }),
    setLoggedOutIndicator:        async (params) => internals.zApApi('JSON/authentication/action/setLoggedOutIndicator/',   { searchParams: new URLSearchParams(params) })
  },
  context: {
    includeInContext:             async (params) => internals.zApApi('JSON/context/action/includeInContext/',               { searchParams: new URLSearchParams(params) }),
    excludeFromContext:           async (params) => internals.zApApi('JSON/context/action/excludeFromContext/',             { searchParams: new URLSearchParams(params) }),
    newContext:                   async (params) => internals.zApApi('JSON/context/action/newContext/',                     { searchParams: new URLSearchParams(params) })
  },
  core: {
    htmlreport:                   async (params) => internals.zApApi('OTHER/core/other/htmlreport/',                                             { responseType: 'text' }),
    jsonreport:                   async (params) => internals.zApApi('OTHER/core/other/jsonreport/'                                                                      ),
    mdreport:                     async (params) => internals.zApApi('OTHER/core/other/mdreport/',                                               { responseType: 'text' }),
    viewNumberOfAlerts:           async (params) => internals.zApApi('JSON/core/view/numberOfAlerts/',                      { searchParams: new URLSearchParams(params) })
  },
  forcedUser: {
    setForcedUser:                async (params) => internals.zApApi('JSON/forcedUser/action/setForcedUser/',               { searchParams: new URLSearchParams(params) }),
    setForcedUserModeEnabled:     async (params) => internals.zApApi('JSON/forcedUser/action/setForcedUserModeEnabled/',    { searchParams: new URLSearchParams(params) })
  },
  script: {
    load:                         async (params) => internals.zApApi('JSON/script/action/load/',                            { searchParams: new URLSearchParams(params) })
  },
  spider: {
    setOptionMaxDepth:            async (params) => internals.zApApi('JSON/spider/action/setOptionMaxDepth/',               { searchParams: new URLSearchParams(params) }),
    setOptionThreadCount:         async (params) => internals.zApApi('JSON/spider/action/setOptionThreadCount/',            { searchParams: new URLSearchParams(params) }),
    scan:                         async (params) => internals.zApApi('JSON/spider/action/scan/',                            { searchParams: new URLSearchParams(params) }),
    scanAsUser:                   async (params) => internals.zApApi('JSON/spider/action/scanAsUser/',                      { searchParams: new URLSearchParams(params) }),
    viewStatus:                   async (params) => internals.zApApi('JSON/spider/view/status/',                            { searchParams: new URLSearchParams(params) }),
  },
  users: {
    newUser:                      async (params) => internals.zApApi('JSON/users/action/newUser/',                          { searchParams: new URLSearchParams(params) }),
    setAuthenticationCredentials: async (params) => internals.zApApi('JSON/users/action/setAuthenticationCredentials/',     { searchParams: new URLSearchParams(params) }),
    setUserEnabled:               async (params) => internals.zApApi('JSON/users/action/setUserEnabled/',                   { searchParams: new URLSearchParams(params) })
  }
};
/* eslint-enable */

// eslint-disable-next-line consistent-return
const numberOfAlertsForSesh = (alertCnt) => {
  if (alertCnt) internals.alertCount = alertCnt;
  return internals.alertCount;
};

internals.sitesTree = {
  // Only used for BrowserApp.
  populateWithAuthRoute: async (sUt) => {
    // In the future we could probably do away with selenium, then this step could be done here.
    const { Strategy, args } = sUt.getSitesTreeSutAuthenticationPopulationStrategy();
    const sitesTreeSutAuthenticationPopulation = new Strategy(args);
    await sitesTreeSutAuthenticationPopulation.authenticate();
  },
  populateWithSutRoutes: async (sUt) => {
    const { Strategy, args } = sUt.getSitesTreePopulationStrategy();
    const sitesTreePopulation = new Strategy({ ...args /* , additional args */ });
    await sitesTreePopulation.populate();
  }
};

const configureAuthentication = async (sUt) => {
  const { Strategy, args } = sUt.getEmissaryAuthenticationStrategy();
  const emissaryAuthentication = new Strategy({ ...args, emissaryPropertiesSubSet: getProperties(['uploadDir', 'spider']), zAp: { aPi: internals.zApApiRoutes } });
  await emissaryAuthentication.configure();
};

const spiderScan = async (sUt) => {
  const { Strategy, args } = sUt.getSpiderStrategy();
  const spider = new Strategy({ ...args, emissaryPropertiesSubSet: getProperties('spider'), zAp: { aPi: internals.zApApiRoutes } });
  await spider.scan();
};

const configureActiveScanners = async (sUt) => {
  const { Strategy, args } = sUt.getScannersStrategy();
  const scanners = new Strategy({ ...args, zAp: { aPi: internals.zApApiRoutes } });
  await scanners.configure();
};

const activeScanRoutes = async (sUt) => {
  const { Strategy, args } = sUt.getScanningStrategy();
  const scanning = new Strategy({ ...args, emissaryPropertiesSubSet: getProperties(['apiFeedbackSpeed', 'spider']), zAp: { aPi: internals.zApApiRoutes, numberOfAlertsForSesh } });
  await scanning.scan();
};

const postScanProcess = (sUt) => {
  const { Strategy, args } = sUt.getPostScanningStrategy();
  const postScanning = new Strategy({ ...args, zAp: { numberOfAlertsForSesh } });
  postScanning.process();
};

const createReports = async (sUt) => {
  const { Strategy, args } = sUt.getReportingStrategy();
  const reporting = new Strategy({ ...args, emissaryPropertiesSubSet: getProperties(['reportDir', 'reportFormats']), zAp: { aPi: internals.zApApiRoutes } });
  await reporting.createReports();
};

const initialise = (options) => {
  internals.log = options.log;
  internals.publisher = options.publisher;
  const { emissaryProperties } = options;
  const { validateProperties } = internals;
  internals.properties = { knownZapErrorsWithHelpMessageForBuildUser: internals.knownZapErrorsWithHelpMessageForBuildUser, ...validateProperties(emissaryProperties) };

  const zapApiOptions = {
    aPiKey: internals.properties.apiKey,
    proxy: `${internals.properties.protocol}://${internals.properties.hostname}:${internals.properties.port}`
  };

  internals.initZapApi(zapApiOptions);
};

module.exports = {
  getPropertiesForBrowserAppSut: () => getProperties(['protocol', 'hostname', 'port', 'knownZapErrorsWithHelpMessageForBuildUser']),
  getPropertiesForApiSut: () => ({ /* Populate as required */ }),
  numberOfAlertsForSesh,
  initialise,
  populateSitesTreeWithAuthRoute: internals.sitesTree.populateWithAuthRoute,
  populateSitesTreeWithSutRoutes: internals.sitesTree.populateWithSutRoutes,
  configureAuthentication,
  spiderScan,
  configureActiveScanners,
  activeScanRoutes,
  postScanProcess,
  createReports
};
