import {refEquals} from "tfw/core/data"
import {Mutable, Value} from "tfw/core/react"
import {MutableSet} from "tfw/core/rcollect"
import {Noop, PMap, getValue} from "tfw/core/util"
import {DEFAULT_PAGE, GameEngine, GameObject, SpaceConfig} from "tfw/engine/game"
import {getCurrentEditNumber} from "tfw/ui/element"
import {Model, ModelKey, dataProvider} from "tfw/ui/model"

export interface SpaceEditConfig {
  [id :string] :PMap<any>
}

export interface GameObjectEdit {
  editNumber? :number
  activePage? :string
  selection? :Set<string>
  expanded? :Set<string>
  add? :SpaceConfig
  edit? :SpaceEditConfig
  remove? :Set<string>
}

interface FullGameObjectEdit extends GameObjectEdit {
  activePage :string
  selection :Set<string>
  expanded :Set<string>
  add :SpaceConfig
  edit :SpaceEditConfig
  remove :Set<string>
}

export function createUIModel (gameEngine :GameEngine) {
  const getOrder = (id :string) => {
    if (id === DEFAULT_PAGE) return 0
    return gameEngine.gameObjects.require(id).order
  }
  const models = new Map<ModelKey, Model>()
  const pageEditor = createGameObjectEditor(gameEngine, models)
  const selection = MutableSet.local<string>()
  const expanded = MutableSet.local<string>()
  const canUndo = Mutable.local(false)
  const canRedo = Mutable.local(false)
  const undoStack :FullGameObjectEdit[] = []
  const redoStack :FullGameObjectEdit[] = []
  const applyEdit = (edit :GameObjectEdit) => {
    const oldActivePage = gameEngine.activePage.current
    const oldSelection = new Set(selection)
    const oldExpanded = new Set(expanded)
    const reverseEdit = pageEditor(edit)
    if (edit.activePage) gameEngine.activePage.update(edit.activePage)
    if (edit.selection) setIdSet(selection, edit.selection)
    if (edit.expanded) setIdSet(expanded, edit.expanded)
    const lastEdit = undoStack[undoStack.length - 1]
    const currentEditNumber = getCurrentEditNumber()
    if (lastEdit && lastEdit.editNumber === currentEditNumber) {
      // merge into last edit
      for (const id in reverseEdit.add) {
        const gameObjectConfig = reverseEdit.add[id]
        const editConfig = lastEdit.edit[id]
        if (editConfig) {
          delete lastEdit.edit[id]
          mergeEdits(gameObjectConfig, editConfig)

        } else if (lastEdit.remove.has(id)) {
          lastEdit.remove.delete(id)
          continue
        }
        lastEdit.add[id] = gameObjectConfig
      }
      for (const id in reverseEdit.edit) {
        const gameObjectConfig = reverseEdit.edit[id]
        const editConfig = lastEdit.edit[id]
        if (editConfig) {
          mergeEdits(gameObjectConfig, editConfig)
        } else if (lastEdit.remove.has(id)) {
          continue
        }
        lastEdit.edit[id] = gameObjectConfig
      }
      for (const id of reverseEdit.remove) {
        if (!lastEdit.add[id]) {
          lastEdit.remove.add(id)
        }
      }
    } else {
      reverseEdit.editNumber = currentEditNumber
      reverseEdit.activePage = oldActivePage
      reverseEdit.selection = oldSelection
      reverseEdit.expanded = oldExpanded
      undoStack.push(reverseEdit)
    }
    redoStack.length = 0
    canUndo.update(true)
    canRedo.update(false)
  }
  const modelData = {
    resolve: (key :ModelKey) => {
      let model = models.get(key)
      if (!model) {
        const gameObject = gameEngine.gameObjects.require(key as string)
        const createPropertyValue = createPropertyValueCreator(gameObject, applyEdit)
        models.set(key, model = new Model({
          id: Value.constant(key),
          name: createPropertyValue("name"),
          childKeys: gameObject.transform.childIds,
          childData: modelData,
          expanded: expanded.hasValue(key as string),
          toggleExpanded: () => {
            if (expanded.has(key as string)) expanded.delete(key as string)
            else expanded.add(key as string)
          },
        }))
      }
      return model
    },
  }
  const getUnusedName = (base :string) => {
    let name = base
    for (let ii = 2; gameEngine.gameObjects.has(name); ii++) name = base + ii
    return name
  }
  return new Model({
    menuBarKeys: Value.constant(["object"]),
    menuBarData: dataProvider({
      object: {
        name: Value.constant("Object"),
        keys: Value.constant(["group", "camera", "light", "model", "primitive"]),
        data: dataProvider({
          group: {
            name: Value.constant("Group"),
            action: () => {
              const name = getUnusedName("group")
              applyEdit({selection: new Set([name]), add: {[name]: {}}})
            },
          },
          camera: {
            name: Value.constant("Camera"),
            action: () => {
              const name = getUnusedName("camera")
              applyEdit({selection: new Set([name]), add: {[name]: {camera: {}}}})
            },
          },
          light: {
            name: Value.constant("Light"),
            action: () => {
              const name = getUnusedName("light")
              applyEdit({selection: new Set([name]), add: {[name]: {light: {}}}})
            },
          },
          model: {
            name: Value.constant("Model"),
            action: () => {
              const name = getUnusedName("model")
              applyEdit({selection: new Set([name]), add: {[name]: {model: {}}}})
            },
          },
          primitive: {
            name: Value.constant("Primitive"),
            submenu: Value.constant(true),
            keys: Value.constant(["sphere", "cylinder", "cube", "quad"]),
            data: dataProvider({
              sphere: {
                name: Value.constant("Sphere"),
                action: () => {
                  const name = getUnusedName("sphere")
                  applyEdit({
                    selection: new Set([name]),
                    add: {[name]: {meshFilter: {}, meshRenderer: {}}},
                  })
                },
              },
              cylinder: {
                name: Value.constant("Cylinder"),
                action: () => {
                  const name = getUnusedName("cylinder")
                  applyEdit({
                    selection: new Set([name]),
                    add: {[name]: {meshFilter: {}, meshRenderer: {}}},
                  })
                },
              },
              cube: {
                name: Value.constant("Cube"),
                action: () => {
                  const name = getUnusedName("cube")
                  applyEdit({
                    selection: new Set([name]),
                    add: {[name]: {meshFilter: {}, meshRenderer: {}}},
                  })
                },
              },
              quad: {
                name: Value.constant("Quad"),
                action: () => {
                  const name = getUnusedName("quad")
                  applyEdit({
                    selection: new Set([name]),
                    add: {[name]: {meshFilter: {}, meshRenderer: {}}},
                  })
                },
              },
            }),
          },
        }),
      },
    }),
    pageKeys: gameEngine.pages,
    pageData: {
      resolve: (key :ModelKey) => {
        let model = models.get(key)
        if (!model) {
          if (key === DEFAULT_PAGE) {
            models.set(key, model = new Model({
              id: Value.constant(DEFAULT_PAGE),
              name: Value.constant(DEFAULT_PAGE),
              removable: Value.constant(false),
              remove: Noop,
            }))
          } else {
            const gameObject = gameEngine.gameObjects.require(key as string)
            const createPropertyValue = createPropertyValueCreator(gameObject, applyEdit)
            models.set(key, model = new Model({
              id: Value.constant(key),
              name: createPropertyValue("name"),
              removable: Value.constant(true),
              remove: () => applyEdit({remove: new Set([gameObject.id])}),
            }))
          }
        }
        return model
      },
    },
    activePage: gameEngine.activePage,
    createPage: () => {
      // find an unused id for a name, starting with "page2"
      let name = ""
      for (let ii = 2;; ii++) {
        const id = "page" + ii
        if (!gameEngine.gameObjects.has(id)) {
          name = id
          break
        }
      }
      applyEdit({add: {[name]: {page: {}}}})
    },
    updateOrder: (key :string, index :number) => {
      const currentPageKeys = gameEngine.pages.current
      const currentIndex = currentPageKeys.indexOf(key)
      if (currentIndex === index) return
      const edit = {edit: {}}
      if (key === DEFAULT_PAGE) {
        // to reorder the default page, we adjust the order of everything around it
        let order = -1
        for (let ii = index - 1; ii >= 0; ii--) {
          const key = currentPageKeys[ii]
          if (key !== DEFAULT_PAGE) edit.edit[key] = {order: order--}
        }
        order = 1
        for (let ii = index; ii < currentPageKeys.length; ii++) {
          const key = currentPageKeys[ii]
          if (key !== DEFAULT_PAGE) edit.edit[key] = {order: order++}
        }
      } else {
        // to reorder an ordinary page, we change its order
        let newOrder :number
        switch (index) {
          case 0:
            newOrder = getOrder(currentPageKeys[0]) - 1
            break
          case currentPageKeys.length:
            newOrder = getOrder(currentPageKeys[currentPageKeys.length - 1]) + 1
            break
          default:
            newOrder = (getOrder(currentPageKeys[index]) + getOrder(currentPageKeys[index - 1])) / 2
            break
        }
        edit.edit[key] = {order: newOrder}
      }
      applyEdit(edit)
    },
    rootKeys: gameEngine.rootIds,
    rootData: modelData,
    selectedKeys: selection,
    updateParentOrder: (key :ModelKey, parent :ModelKey|undefined, index :number) => {
    },
    componentKeys: Value.constant(["one", "two"]),
    componentData: dataProvider({
      one: {
        type: Value.constant("one"),
      },
      two: {
        type: Value.constant("two"),
      },
    }),
    updateComponentOrder: (key :string, index :number) => {
    },
  })
}

function setIdSet (set :MutableSet<string>, newSet :ReadonlySet<string>) {
  // remove anything not in the new set
  for (const id of set) {
    if (!newSet.has(id)) set.delete(id)
  }
  // add anything not in the old set
  for (const id of newSet) set.add(id)
}

function mergeEdits (first :PMap<any>, second :PMap<any>) {
  for (const key in second) {
    first[key] = second[key]
  }
}

function createGameObjectEditor (gameEngine :GameEngine, models :Map<ModelKey, Model>) {
  return (edit :GameObjectEdit) => {
    const reverseAdd :SpaceConfig = {}
    const reverseEdit :SpaceEditConfig = {}
    const reverseRemove = new Set<string>()
    if (edit.remove) {
      for (const id of edit.remove) {
        const gameObject = gameEngine.gameObjects.require(id)
        reverseAdd[id] = gameObject.getConfig()
        gameObject.dispose()
        models.delete(id)
      }
    }
    if (edit.add) {
      for (const id in edit.add) {
        gameEngine.createGameObject(id, edit.add[id])
        reverseRemove.add(id)
      }
    }
    if (edit.edit) {
      for (const id in edit.edit) {
        const gameObject = gameEngine.gameObjects.require(id)
        const editConfig = edit.edit[id]
        const reverseConfig :PMap<any> = {}
        for (const key in editConfig) {
          const property = gameObject.getProperty(key) as Mutable<any>
          const currentValue = property.current
          reverseConfig[key] = currentValue === undefined ? null : currentValue
          property.update(editConfig[key])
        }
        reverseEdit[id] = reverseConfig
      }
    }
    return {add: reverseAdd, edit: reverseEdit, remove: reverseRemove} as FullGameObjectEdit
  }
}

function createPropertyValueCreator (
  gameObject :GameObject,
  applyEdit :(edit :GameObjectEdit) => void,
) {
  return (key :ModelKey, defaultValue? :Value<any>) => {
    const property = gameObject.getProperty(key as string)
    return Mutable.deriveMutable(
      dispatch => property.onChange(dispatch),
      () => getValue(property.current, defaultValue && defaultValue.current),
      input => {
        applyEdit({
          edit: {
            [gameObject.id]: {[key]: input},
          },
        })
      },
      refEquals,
    )
  }
}
