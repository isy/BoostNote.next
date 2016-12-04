import React, { PropTypes } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'
import { Map } from 'immutable'
import Octicon from 'components/Octicon'
import _ from 'lodash'
import Detail from './Detail'
import { isFinallyBlurred } from 'lib/util'
import Dialog from 'main/lib/Dialog'
import StorageManager from 'main/lib/StorageManager'
import moment from 'moment'

const Root = styled.div`
  display: flex;
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
`

const Left = styled.div`
  min-width: 150px;
  display: flex;
  flex-direction: column;
  outline: none;
`

const LeftMenu = styled.div`
  border-bottom: ${p => p.theme.border};
`

const LeftList = styled.div`
  overflow-y: auto;
`

const LeftListItem = styled.div`
  border-bottom: ${p => p.theme.border}
  height: 24px;
  line-height: 24px;
  padding: 0 10px;
  font-size: 12px;
  cursor: pointer;
  transition: 0.15s;
  overflow: hidden;
  text-overflow: ellipsis;
  &:hover {
    background-color: ${p => p.theme.buttonHoverColor};
  }
  &:active {
    background-color: ${p => p.theme.buttonActiveColor};
  }
  &.active {
    background-color: ${p => p.isFocused
      ? p.theme.activeColor
      : p.theme.buttonActiveColor};
    color: ${p => p.isFocused
      ? p.theme.inverseColor
      : p.theme.color};
    .Octicon {
      fill: ${p => p.isFocused
        ? p.theme.inverseColor
        : p.theme.color};
    }
    .empty {
      color: inherit;
    }
  }
  .empty {
    color: ${p => p.theme.inactiveColor};
  }
`

const Slider = styled.div`
  position: relative;
  width: 5px;
  cursor: col-resize;
  display: flex;
  margin-left: -2px;
  margin-right: -2px;
  z-index: 10;
`

const SliderLine = styled.div`
  margin-left: 2px;
  width: 1px;
  background-color: ${p => p.active
    ? p.theme.activeBorderColor
    : p.theme.borderColor};
`

const Right = styled.div`
  flex: 1;
  position: relative;
  outline: none;
`

class NoteList extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      listWidth: props.status.get('noteListWidth'),
      isRightFocused: false,
      isLeftFocused: false
    }

    this.refreshTimer = null
  }

  handleSliderMouseDown = e => {
    window.addEventListener('mouseup', this.handleSliderMouseUp)
    window.addEventListener('mousemove', this.handleSliderMouseMove)
    this.setState({
      isSliderActive: true
    })
  }

  handleSliderMouseMove = e => {
    this.setState({
      listWidth: e.clientX - this.props.status.get('navWidth')
    })
  }

  handleSliderMouseUp = e => {
    window.removeEventListener('mouseup', this.handleSliderMouseUp)
    window.removeEventListener('mousemove', this.handleSliderMouseMove)

    this.setState({
      isSliderActive: false,
      listWidth: e.clientX - this.props.status.get('navWidth')
    })
  }

  handleListItemClick = (e, key) => {
    const { router } = this.context

    router.push({
      pathname: router.location.pathname,
      query: {
        key
      }
    })
  }

  componentDidUpdate () {
    const { location } = this.props
    const { router } = this.context

    const needsRedirectToFirstNote = this.noteListMap.size > 0 && this.noteListMap.get(location.query.key) == null
    if (needsRedirectToFirstNote) {
      router.push({
        pathname: location.pathname,
        query: {
          key: this.noteListMap.keySeq().first()
        }
      })
    }

    if (location.state != null && location.state.active) {
      this.detail.focusEditor()
    }

    this.setRefreshTimer()
  }

  componentDidMount () {
    window.addEventListener('core:delete', this.handleCoreDelete)
  }

  componentWillUnmount () {
    this.invalidateRefreshTimer()
    window.removeEventListener('core:delete', this.handleCoreDelete)
  }

  setRefreshTimer () {
    this.invalidateRefreshTimer()
    this.refreshTimer = window.setTimeout(() => {
      this.forceUpdate()
    }, 60 * 1000)
  }

  invalidateRefreshTimer () {
    window.clearTimeout(this.refreshTimer)
  }

  getNotes () {
    const { storageMap, params } = this.props
    let notes = new Map()

    if (params.folderName != null) {
      let noteSet = storageMap
        .getIn([
          params.storageName,
          'folders',
          params.folderName,
          'notes'
        ])

      if (noteSet == null) return new Map()

      notes = noteSet
        .map(noteId => {
          return [
            noteId,
            storageMap
              .getIn([params.storageName, 'notes', noteId])
          ]
        })
        .toArray()
      notes = new Map(notes)
    } else if (params.storageName != null) {
      notes = storageMap.getIn([params.storageName, 'notes'])
      if (notes == null) return new Map()
    } else {
      notes = new Map()
    }
    return notes
      .sort((a, b) => {
        return moment(b.get('updatedAt')).toDate() - moment(a.get('updatedAt')).toDate()
      })
  }

  handleCoreDelete = e => {
    if ((this.state.isLeftFocused || this.state.isRightFocused) && this.noteListMap.size > 0) {
      const { router, store } = this.context
      const { storageName } = router.params
      const { key } = router.location.query

      const noteMapKeys = this.noteListMap.keySeq()
      const targetIndex = noteMapKeys.keyOf(key)
      const nextIndex = targetIndex + 1 < noteMapKeys.size
        ? targetIndex + 1
        : targetIndex - 1
      const nextNoteKey = noteMapKeys.get(nextIndex)

      Dialog.showMessageBox({
        message: `Are you sure you want to delete the selected note?`,
        buttons: ['Delete Note', 'Cancel']
      }, (index) => {
        if (index === 0) {
          StorageManager.deleteNote(storageName, key)
            .then(() => {
              router.push({
                pathname: router.location.pathname,
                query: {
                  key: nextNoteKey
                }
              })
            })
            .then(() => {
              store.dispatch({
                type: 'DELETE_NOTE',
                payload: {
                  storageName,
                  noteId: key
                }
              })
            })
        }
      })
    }
  }

  handleRightFocus = e => {
    if (!this.state.isRightFocused) {
      this.setState({
        isRightFocused: true
      })
    }
  }

  handleRightBlur = e => {
    if (isFinallyBlurred(e, this.right)) {
      this.setState({
        isRightFocused: false
      })
    }
  }

  handleLeftFocus = e => {
    if (!this.state.isLeftFocused) {
      this.setState({
        isLeftFocused: true
      })
    }
  }

  handleLeftBlur = e => {
    if (isFinallyBlurred(e, this.left)) {
      this.setState({
        isLeftFocused: false
      })
    }
  }

  render () {
    const { location } = this.props
    const noteListMap = this.noteListMap = this.getNotes()

    const noteList = noteListMap
      .map((note, key) => {
        let title = note.get('title')
        let isValidTitle = _.isString(title) && title.trim().length > 0
        let isActive = location.query.key === key
        return <LeftListItem
          key={key}
          onClick={(e) => this.handleListItemClick(e, key)}
          className={isActive && 'active'}
          isFocused={this.state.isLeftFocused}
        >
          {isValidTitle ? title : <span className='empty'>Empty</span>}
        </LeftListItem>
      })
      .toArray()

    const activeNote = location.query.key == null
      ? noteListMap.first()
      : noteListMap.get(location.query.key)

    return (
      <Root>
        <Left
          style={{width: this.state.listWidth}}
          innerRef={c => (this.left = c)}
          tabIndex='0'
          onFocus={this.handleLeftFocus}
          onBlur={this.handleLeftBlur}
        >
          <LeftMenu>
            Sort By <select />
            <button><Octicon icon='grabber' size='12' /></button>
            <button><Octicon icon='three-bars' size='12' /></button>
          </LeftMenu>
          <LeftList>
            {noteList}
          </LeftList>
        </Left>
        <Slider
          onMouseDown={this.handleSliderMouseDown}
          onMouseUp={this.handleSliderMouseUp}
        >
          <SliderLine
            active={this.state.isSliderActive}
          />
        </Slider>
        <Right
          innerRef={c => (this.right = c)}
          tabIndex='0'
          onFocus={this.handleRightFocus}
          onBlur={this.handleRightBlur}
        >
          {activeNote != null
            ? <Detail
              ref={c => (this.detail = c)}
              noteKey={location.query.key}
              note={activeNote}
            />
            : <div>No note.</div>
          }
        </Right>

      </Root>
    )
  }
}

NoteList.propTypes = {
}

NoteList.contextTypes = {
  router: PropTypes.shape({
    push: PropTypes.func
  }),
  store: PropTypes.shape({
    dispatch: PropTypes.func
  }),
  status: PropTypes.instanceOf(Map)
}

export default connect((x) => x)(NoteList)