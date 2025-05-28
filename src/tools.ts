/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import common from './tools/common.js';
import console from './tools/console.js';
import dataAccess from './tools/data-access.js';
import dialogs from './tools/dialogs.js';
import extraction from './tools/extraction.js';
import files from './tools/files.js';
import install from './tools/install.js';
import intelligentCrawler from './tools/intelligent-crawler.js';
import keyboard from './tools/keyboard.js';
import navigate from './tools/navigate.js';
import network from './tools/network.js';
import pagination from './tools/pagination.js';
import pdf from './tools/pdf.js';
import snapshot from './tools/snapshot.js';
import tabs from './tools/tabs.js';
import screenshot from './tools/screenshot.js';
import testing from './tools/testing.js';
import vision from './tools/vision.js';
import wait from './tools/wait.js';

import type { Tool } from './tools/tool.js';

export const snapshotTools: Tool<any>[] = [
  ...common(true),
  ...console,
  ...dataAccess,
  ...dialogs(true),
  ...extraction,
  ...files(true),
  ...install,
  ...intelligentCrawler,
  ...keyboard(true),
  ...navigate(true),
  ...network,
  ...pagination,
  ...pdf,
  ...screenshot,
  ...snapshot,
  ...tabs(true),
  ...testing,
  ...wait(true),
];

export const visionTools: Tool<any>[] = [
  ...common(false),
  ...console,
  ...dataAccess,
  ...dialogs(false),
  ...extraction,
  ...files(false),
  ...install,
  ...intelligentCrawler,
  ...keyboard(false),
  ...navigate(false),
  ...network,
  ...pagination,
  ...pdf,
  ...tabs(false),
  ...testing,
  ...vision,
  ...wait(false),
];
