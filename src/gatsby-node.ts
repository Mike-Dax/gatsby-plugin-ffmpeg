import { setActions } from './index'

import { Actions, PluginOptions } from 'gatsby'

export const unstable_onPluginInit = async (
  { actions }: { actions: Actions },
  pluginOptions: PluginOptions
) => {
  setActions(actions)
}

export const onPreBootstrap = async (
  { actions }: { actions: Actions },
  pluginOptions: PluginOptions
) => {
  setActions(actions)
}
