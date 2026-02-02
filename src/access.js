/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import Config from "./config.js";

export function accessModeAllowed(documentURL, mode) {
  documentURL = documentURL || Config.DocumentURL;

  const wac = Config.Resource?.[documentURL]?.headers?.['wac-allow']?.permissionGroup;
  if (!wac) return false;

  return (
    (wac.user && wac.user.includes(mode)) ||
    (wac.public && wac.public.includes(mode))
  );
}

export function accessModePossiblyAllowed(documentURL, mode) {
  documentURL = documentURL || Config.DocumentURL;

  const wac = Config.Resource?.[documentURL]?.headers?.['wac-allow']?.permissionGroup;

  if (!wac) return true;

  return accessModeAllowed(documentURL, mode);
}
