import { isValidCSSStyleValue } from '@tiptap/core'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { yCursorPlugin } from '@tiptap/y-tiptap'
import { getAwarenessSelection } from './block-group-ui'

const awarenessStatesToArray = (states: Map<number, Record<string, any> | null | undefined>) => {
  return Array.from(states.entries()).map(([key, value]) => {
    if (value && value.user) return { clientId: key, ...value.user }
    return { clientId: key }
  })
}

const sanitizeUserColor = (user: Record<string, any>) => ({
  ...user,
  color: isValidCSSStyleValue(user.color) && /^#[0-9a-fA-F]{6}$/.test(user.color)
    ? user.color
    : 'transparent',
})

export const CollaborationCaretWithBlockGroup = CollaborationCaret.extend({
  addProseMirrorPlugins() {
    const { provider } = this.options
    const storage = this.storage
    const user = this.options.user
    const awarenessListenerPlugin = new Plugin({
      key: new PluginKey('collaborationCaretAwarenessListener'),
      view: () => {
        const onAwarenessUpdate = () => {
          storage.users = awarenessStatesToArray(provider.awareness.states)
        }

        provider.awareness.setLocalStateField('user', user)
        storage.users = awarenessStatesToArray(provider.awareness.states)
        provider.awareness.on('update', onAwarenessUpdate)

        return {
          destroy: () => {
            provider.awareness.off('update', onAwarenessUpdate)
            storage.users = []
          },
        }
      },
    })

    return [
      awarenessListenerPlugin,
      yCursorPlugin(provider.awareness, {
        cursorBuilder: currentUser => this.options.render(sanitizeUserColor(currentUser)),
        selectionBuilder: currentUser => this.options.selectionRender(sanitizeUserColor(currentUser)),
        getSelection: getAwarenessSelection,
      }),
    ]
  },
})
